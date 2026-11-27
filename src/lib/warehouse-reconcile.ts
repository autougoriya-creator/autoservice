import { prisma } from "@/lib/prisma";
import { parseDateInput, toDateInputValue } from "@/lib/schedule-fill";

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function endOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function defaultReconcileRange(now = new Date()) {
  const to = new Date(now);
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return {
    from,
    to,
    fromValue: toDateInputValue(from),
    toValue: toDateInputValue(to),
  };
}

export function parseReconcileRange(fromRaw?: string, toRaw?: string) {
  const fallback = defaultReconcileRange();
  const from = parseDateInput(fromRaw ?? "") ?? fallback.from;
  let to = parseDateInput(toRaw ?? "") ?? fallback.to;
  if (to.getTime() < from.getTime()) to = new Date(from);
  return {
    from,
    to,
    fromValue: toDateInputValue(from),
    toValue: toDateInputValue(to),
    rangeStart: from,
    rangeEnd: endOfLocalDay(to),
  };
}

export type SkuReconcileRow = {
  fluidSkuId: string;
  name: string;
  unit: string;
  opening: number;
  receipts: number;
  normConsumption: number;
  woWriteoff: number;
  manualConsumption: number;
  inventoryDelta: number;
  expected: number;
  fact: number;
  variance: number;
  hasInventoryInPeriod: boolean;
};

export type PostNormRow = {
  postId: string;
  postName: string;
  workOrderCount: number;
  fluids: {
    fluidSkuId: string;
    name: string;
    unit: string;
    quantity: number;
  }[];
};

export type WarehouseReconcile = {
  from: Date;
  to: Date;
  fromValue: string;
  toValue: string;
  skuRows: SkuReconcileRow[];
  postRows: PostNormRow[];
  unassigned: PostNormRow | null;
};

/** Сверка: приход − расход по норме vs факт после инвентаризации; расход по постам. */
export async function buildWarehouseReconcile(
  organizationId: string,
  fromRaw?: string,
  toRaw?: string,
): Promise<WarehouseReconcile> {
  const range = parseReconcileRange(fromRaw, toRaw);
  const { rangeStart, rangeEnd, from, to, fromValue, toValue } = range;

  const [skus, movements, workOrders, posts] = await Promise.all([
    prisma.fluidSku.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: {
        organizationId,
        OR: [
          { createdAt: { lt: rangeStart } },
          { createdAt: { gte: rangeStart, lte: rangeEnd } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        fluidSkuId: true,
        type: true,
        quantityDelta: true,
        quantityAfter: true,
        workOrderId: true,
        createdAt: true,
      },
    }),
    prisma.workOrder.findMany({
      where: {
        organizationId,
        status: { in: ["IN_PROGRESS", "CLOSED"] },
        OR: [
          { completedAt: { gte: rangeStart, lte: rangeEnd } },
          { scheduledAt: { gte: rangeStart, lte: rangeEnd } },
          { createdAt: { gte: rangeStart, lte: rangeEnd } },
        ],
      },
      include: {
        post: true,
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
    }),
    prisma.servicePost.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const skuRows: SkuReconcileRow[] = skus.map((sku) => {
    const before = movements.filter(
      (m) => m.fluidSkuId === sku.id && m.createdAt < rangeStart,
    );
    const inPeriod = movements.filter(
      (m) =>
        m.fluidSkuId === sku.id &&
        m.createdAt >= rangeStart &&
        m.createdAt <= rangeEnd,
    );

    const opening =
      before.length > 0
        ? before[before.length - 1]!.quantityAfter
        : Math.max(
            0,
            round3(
              sku.quantityOnHand -
                inPeriod.reduce((s, m) => s + m.quantityDelta, 0),
            ),
          );

    let receipts = 0;
    let woWriteoff = 0;
    let manualConsumption = 0;
    let inventoryDelta = 0;
    let lastInventoryAfter: number | null = null;

    for (const m of inPeriod) {
      if (m.type === "RECEIPT") {
        receipts = round3(receipts + m.quantityDelta);
      } else if (m.type === "CONSUMPTION") {
        const abs = Math.abs(m.quantityDelta);
        if (m.workOrderId) woWriteoff = round3(woWriteoff + abs);
        else manualConsumption = round3(manualConsumption + abs);
      } else if (m.type === "INVENTORY") {
        inventoryDelta = round3(inventoryDelta + m.quantityDelta);
        lastInventoryAfter = m.quantityAfter;
      }
    }

    return {
      fluidSkuId: sku.id,
      name: sku.name,
      unit: sku.unit,
      opening,
      receipts,
      normConsumption: 0,
      woWriteoff,
      manualConsumption,
      inventoryDelta,
      expected: 0,
      fact: lastInventoryAfter ?? sku.quantityOnHand,
      variance: 0,
      hasInventoryInPeriod: lastInventoryAfter != null,
    };
  });

  const bySku = new Map(skuRows.map((r) => [r.fluidSkuId, r]));

  type FluidAgg = {
    fluidSkuId: string;
    name: string;
    unit: string;
    quantity: number;
  };
  const postMap = new Map<
    string,
    { postId: string; postName: string; workOrderCount: number; fluids: Map<string, FluidAgg> }
  >();
  for (const post of posts) {
    postMap.set(post.id, {
      postId: post.id,
      postName: post.name,
      workOrderCount: 0,
      fluids: new Map(),
    });
  }
  const unassignedFluids = new Map<string, FluidAgg>();
  let unassignedCount = 0;

  function addNorm(
    target: Map<string, FluidAgg>,
    fluidSkuId: string,
    name: string,
    unit: string,
    qty: number,
  ) {
    const prev = target.get(fluidSkuId);
    if (prev) prev.quantity = round3(prev.quantity + qty);
    else target.set(fluidSkuId, { fluidSkuId, name, unit, quantity: round3(qty) });
  }

  for (const wo of workOrders) {
    const when = wo.completedAt ?? wo.scheduledAt ?? wo.createdAt;
    if (when < rangeStart || when > rangeEnd) continue;

    let bucket = wo.postId ? postMap.get(wo.postId) : null;
    if (wo.postId && !bucket) {
      bucket = {
        postId: wo.postId,
        postName: wo.post?.name ?? "Пост",
        workOrderCount: 0,
        fluids: new Map(),
      };
      postMap.set(wo.postId, bucket);
    }
    if (bucket) bucket.workOrderCount += 1;
    else unassignedCount += 1;

    for (const line of wo.lines) {
      for (const norm of line.service?.fluidNorms ?? []) {
        if (!norm.fluidSku.isActive) continue;
        const qty = round3(norm.quantityPerUnit * line.quantity);
        if (qty <= 0) continue;
        const row = bySku.get(norm.fluidSkuId);
        if (row) row.normConsumption = round3(row.normConsumption + qty);
        if (bucket) {
          addNorm(
            bucket.fluids,
            norm.fluidSkuId,
            norm.fluidSku.name,
            norm.fluidSku.unit,
            qty,
          );
        } else {
          addNorm(
            unassignedFluids,
            norm.fluidSkuId,
            norm.fluidSku.name,
            norm.fluidSku.unit,
            qty,
          );
        }
      }
    }
  }

  for (const row of skuRows) {
    // Ожидаемый = остаток на начало + приход − расход по норме − ручной расход
    row.expected = round3(
      row.opening + row.receipts - row.normConsumption - row.manualConsumption,
    );
    row.variance = round3(row.fact - row.expected);
  }

  const postRows: PostNormRow[] = [...postMap.values()]
    .filter((p) => p.workOrderCount > 0 || p.fluids.size > 0)
    .map((p) => ({
      postId: p.postId,
      postName: p.postName,
      workOrderCount: p.workOrderCount,
      fluids: [...p.fluids.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "ru"),
      ),
    }));

  const unassigned: PostNormRow | null =
    unassignedCount > 0 || unassignedFluids.size > 0
      ? {
          postId: "",
          postName: "Без поста",
          workOrderCount: unassignedCount,
          fluids: [...unassignedFluids.values()].sort((a, b) =>
            a.name.localeCompare(b.name, "ru"),
          ),
        }
      : null;

  return {
    from,
    to,
    fromValue,
    toValue,
    skuRows,
    postRows,
    unassigned,
  };
}
