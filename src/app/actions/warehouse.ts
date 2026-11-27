"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseQty } from "@/lib/warehouse";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optStr(formData: FormData, key: string) {
  const value = str(formData, key);
  return value || null;
}

function revalidateWarehouse(paths: string[] = []) {
  revalidatePath("/owner/warehouse");
  revalidatePath("/owner/warehouse/inventory");
  revalidatePath("/owner/warehouse/reconcile");
  for (const p of paths) revalidatePath(p);
}

export async function createFluidSku(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const name = str(formData, "name");
  const unit = str(formData, "unit") || "л";
  const skuCode = optStr(formData, "skuCode");
  const initialQty = parseQty(str(formData, "quantityOnHand")) ?? 0;

  if (!name) throw new Error("Укажите название техжидкости");
  if (initialQty < 0) throw new Error("Остаток не может быть отрицательным");

  const sku = await prisma.$transaction(async (tx) => {
    const created = await tx.fluidSku.create({
      data: {
        organizationId,
        name,
        unit,
        skuCode,
        isActive: str(formData, "isActive") !== "0",
        quantityOnHand: initialQty,
      },
    });
    if (initialQty > 0) {
      await tx.stockMovement.create({
        data: {
          organizationId,
          fluidSkuId: created.id,
          type: "RECEIPT",
          quantityDelta: initialQty,
          quantityAfter: initialQty,
          note: "Начальный остаток",
          createdById: session.id,
        },
      });
    }
    return created;
  });

  revalidateWarehouse([`/owner/warehouse/${sku.id}`]);
  redirect(`/owner/warehouse/${sku.id}`);
}

export async function updateFluidSku(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const name = str(formData, "name");
  const unit = str(formData, "unit") || "л";
  const skuCode = optStr(formData, "skuCode");

  if (!id || !name) throw new Error("Некорректные данные");

  await prisma.fluidSku.updateMany({
    where: { id, organizationId },
    data: {
      name,
      unit,
      skuCode,
      isActive: str(formData, "isActive") !== "0",
    },
  });

  revalidateWarehouse([`/owner/warehouse/${id}`, "/owner/services"]);
  redirect(`/owner/warehouse/${id}`);
}

export async function deleteFluidSku(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");

  await prisma.fluidSku.deleteMany({ where: { id, organizationId } });
  revalidateWarehouse(["/owner/services"]);
  redirect("/owner/warehouse");
}

async function applyMovement(opts: {
  organizationId: string;
  fluidSkuId: string;
  type: StockMovementType;
  delta: number;
  absoluteAfter?: number;
  note: string | null;
  createdById: string;
  workOrderId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const sku = await tx.fluidSku.findFirst({
      where: { id: opts.fluidSkuId, organizationId: opts.organizationId },
    });
    if (!sku) throw new Error("Позиция склада не найдена");

    const quantityAfter =
      opts.absoluteAfter !== undefined
        ? opts.absoluteAfter
        : Math.round((sku.quantityOnHand + opts.delta) * 1000) / 1000;
    const quantityDelta =
      opts.absoluteAfter !== undefined
        ? Math.round((opts.absoluteAfter - sku.quantityOnHand) * 1000) / 1000
        : opts.delta;

    await tx.fluidSku.update({
      where: { id: sku.id },
      data: { quantityOnHand: quantityAfter },
    });

    return tx.stockMovement.create({
      data: {
        organizationId: opts.organizationId,
        fluidSkuId: sku.id,
        type: opts.type,
        quantityDelta,
        quantityAfter,
        note: opts.note,
        workOrderId: opts.workOrderId ?? null,
        createdById: opts.createdById,
      },
    });
  });
}

export async function receiveStock(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const fluidSkuId = str(formData, "fluidSkuId");
  const qty = parseQty(str(formData, "quantity"));
  const note = optStr(formData, "note");

  if (!fluidSkuId || qty === null || qty <= 0) {
    throw new Error("Укажите позицию и положительное количество");
  }

  await applyMovement({
    organizationId,
    fluidSkuId,
    type: "RECEIPT",
    delta: qty,
    note: note ?? "Поступление на склад",
    createdById: session.id,
  });

  revalidateWarehouse([`/owner/warehouse/${fluidSkuId}`]);
  redirect("/owner/warehouse");
}

export async function consumeStock(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const fluidSkuId = str(formData, "fluidSkuId");
  const qty = parseQty(str(formData, "quantity"));
  const note = optStr(formData, "note");

  if (!fluidSkuId || qty === null || qty <= 0) {
    throw new Error("Укажите позицию и положительное количество");
  }

  await applyMovement({
    organizationId,
    fluidSkuId,
    type: "CONSUMPTION",
    delta: -qty,
    note: note ?? "Ручной расход",
    createdById: session.id,
  });

  revalidateWarehouse([`/owner/warehouse/${fluidSkuId}`]);
  redirect("/owner/warehouse");
}

/** Инвентаризация: задаёт фактический остаток */
export async function inventoryAdjust(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const fluidSkuId = str(formData, "fluidSkuId");
  const counted = parseQty(str(formData, "countedQuantity"));
  const note = optStr(formData, "note");

  if (!fluidSkuId || counted === null || counted < 0) {
    throw new Error("Укажите позицию и фактический остаток (≥ 0)");
  }

  await applyMovement({
    organizationId,
    fluidSkuId,
    type: "INVENTORY",
    delta: 0,
    absoluteAfter: counted,
    note: note ?? "Инвентаризация",
    createdById: session.id,
  });

  revalidateWarehouse([
    `/owner/warehouse/${fluidSkuId}`,
    "/owner/warehouse/inventory",
  ]);
  redirect("/owner/warehouse/inventory");
}

/**
 * Инвентаризация конца периода: фактические остатки по всем (или отмеченным) позициям.
 * Поля формы: counted_<fluidSkuId>, note (общий комментарий).
 */
export async function inventoryAdjustBatch(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const note = optStr(formData, "note") ?? "Инвентаризация за период";
  const periodLabel = optStr(formData, "periodLabel");
  const fullNote = periodLabel ? `${note} · ${periodLabel}` : note;

  const skus = await prisma.fluidSku.findMany({
    where: { organizationId, isActive: true },
    select: { id: true },
  });

  const updates: { fluidSkuId: string; counted: number }[] = [];
  for (const sku of skus) {
    const raw = str(formData, `counted_${sku.id}`);
    if (!raw) continue;
    const counted = parseQty(raw);
    if (counted === null || counted < 0) {
      throw new Error("Фактический остаток должен быть числом ≥ 0");
    }
    updates.push({ fluidSkuId: sku.id, counted });
  }

  if (updates.length === 0) {
    throw new Error("Укажите фактический остаток хотя бы по одной позиции");
  }

  for (const u of updates) {
    await applyMovement({
      organizationId,
      fluidSkuId: u.fluidSkuId,
      type: "INVENTORY",
      delta: 0,
      absoluteAfter: u.counted,
      note: fullNote,
      createdById: session.id,
    });
  }

  revalidateWarehouse(
    updates.map((u) => `/owner/warehouse/${u.fluidSkuId}`),
  );
  redirect("/owner/warehouse/inventory");
}

export async function saveServiceFluidNorm(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const serviceId = str(formData, "serviceId");
  const fluidSkuId = str(formData, "fluidSkuId");
  const quantityPerUnit = parseQty(str(formData, "quantityPerUnit"));

  if (!serviceId || !fluidSkuId || quantityPerUnit === null || quantityPerUnit <= 0) {
    throw new Error("Укажите техжидкость и норму расхода > 0");
  }

  const [service, sku] = await Promise.all([
    prisma.service.findFirst({ where: { id: serviceId, organizationId } }),
    prisma.fluidSku.findFirst({ where: { id: fluidSkuId, organizationId } }),
  ]);
  if (!service || !sku) throw new Error("Услуга или техжидкость не найдены");

  await prisma.serviceFluidNorm.upsert({
    where: {
      serviceId_fluidSkuId: { serviceId, fluidSkuId },
    },
    create: {
      organizationId,
      serviceId,
      fluidSkuId,
      quantityPerUnit,
    },
    update: { quantityPerUnit },
  });

  revalidatePath("/owner/services");
  revalidatePath(`/owner/services/${serviceId}`);
  redirect(`/owner/services/${serviceId}`);
}

export async function deleteServiceFluidNorm(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const serviceId = str(formData, "serviceId");

  await prisma.serviceFluidNorm.deleteMany({
    where: { id, organizationId },
  });

  revalidatePath("/owner/services");
  revalidatePath(`/owner/services/${serviceId}`);
  redirect(`/owner/services/${serviceId}`);
}
