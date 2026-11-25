import type { StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const stockMovementLabel: Record<StockMovementType, string> = {
  RECEIPT: "Поступление",
  CONSUMPTION: "Расход",
  INVENTORY: "Инвентаризация",
};

export function formatQty(qty: number, unit = "л") {
  const rounded = Math.round(qty * 1000) / 1000;
  const text =
    Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-9
      ? String(Math.round(rounded))
      : rounded.toFixed(3).replace(/\.?0+$/, "");
  return `${text} ${unit}`;
}

export function parseQty(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

type NormNeed = { fluidSkuId: string; quantity: number; name: string; unit: string };

/** Суммирует расход техжидкостей по нормам строк заказ-наряда */
export async function computeWriteoffNeeds(
  organizationId: string,
  workOrderId: string,
): Promise<NormNeed[]> {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, organizationId },
    include: {
      lines: {
        where: { serviceId: { not: null } },
        include: {
          service: {
            include: {
              fluidNorms: { include: { fluidSku: true } },
            },
          },
        },
      },
    },
  });
  if (!workOrder) return [];

  const bySku = new Map<string, NormNeed>();
  for (const line of workOrder.lines) {
    const norms = line.service?.fluidNorms ?? [];
    for (const norm of norms) {
      if (!norm.fluidSku.isActive) continue;
      const qty = norm.quantityPerUnit * line.quantity;
      if (qty <= 0) continue;
      const prev = bySku.get(norm.fluidSkuId);
      if (prev) {
        prev.quantity = Math.round((prev.quantity + qty) * 1000) / 1000;
      } else {
        bySku.set(norm.fluidSkuId, {
          fluidSkuId: norm.fluidSkuId,
          quantity: Math.round(qty * 1000) / 1000,
          name: norm.fluidSku.name,
          unit: norm.fluidSku.unit,
        });
      }
    }
  }
  return [...bySku.values()];
}

/** Списывает техжидкости по нормам услуг заказ-наряда (идемпотентно по workOrderId) */
export async function applyNormWriteoff(opts: {
  organizationId: string;
  workOrderId: string;
  createdById?: string | null;
  note?: string;
}) {
  const existing = await prisma.stockMovement.count({
    where: {
      organizationId: opts.organizationId,
      workOrderId: opts.workOrderId,
      type: "CONSUMPTION",
    },
  });
  if (existing > 0) return { skipped: true as const, movements: [] };

  const needs = await computeWriteoffNeeds(
    opts.organizationId,
    opts.workOrderId,
  );
  if (needs.length === 0) return { skipped: false as const, movements: [] };

  const movements = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const need of needs) {
      const sku = await tx.fluidSku.findFirst({
        where: { id: need.fluidSkuId, organizationId: opts.organizationId },
      });
      if (!sku) continue;
      const quantityAfter =
        Math.round((sku.quantityOnHand - need.quantity) * 1000) / 1000;
      await tx.fluidSku.update({
        where: { id: sku.id },
        data: { quantityOnHand: quantityAfter },
      });
      const movement = await tx.stockMovement.create({
        data: {
          organizationId: opts.organizationId,
          fluidSkuId: sku.id,
          type: "CONSUMPTION",
          quantityDelta: -need.quantity,
          quantityAfter,
          note:
            opts.note ??
            `Автосписание по нормам ЗН`,
          workOrderId: opts.workOrderId,
          createdById: opts.createdById ?? null,
        },
      });
      created.push(movement);
    }
    return created;
  });

  return { skipped: false as const, movements };
}
