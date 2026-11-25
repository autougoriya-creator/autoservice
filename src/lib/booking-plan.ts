import { periodBounds, type PeriodKey } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

/** Активные записи (ещё не отменены) — для плана выручки */
const ACTIVE_BOOKING = new Set(["NEW", "NEW_FROM_CLIENT", "CONFIRMED"]);

export function bookingLinesTotal(
  lines: { priceRub: number; quantity: number }[],
) {
  return lines.reduce((sum, l) => sum + l.priceRub * l.quantity, 0);
}

export function bookingLinesDuration(
  lines: { durationMin: number; quantity: number }[],
) {
  return Math.max(
    15,
    lines.reduce((sum, l) => sum + l.durationMin * l.quantity, 0),
  );
}

export function summarizeServiceNames(
  lines: { name: string; quantity: number }[],
) {
  if (lines.length === 0) return "Услуга";
  return lines
    .map((l) => (l.quantity > 1 ? `${l.name} ×${l.quantity}` : l.name))
    .join(", ");
}

export type PlannedLineInput = {
  serviceId?: string | null;
  name: string;
  priceRub: number;
  durationMin: number;
  quantity?: number;
};

export function normalizePlannedLines(raw: PlannedLineInput[]) {
  return raw
    .map((l) => ({
      serviceId: l.serviceId || null,
      name: l.name.trim() || "Услуга",
      priceRub: Math.max(0, Math.round(l.priceRub)),
      durationMin: Math.max(5, Math.round(l.durationMin)),
      quantity: Math.max(1, Math.round(l.quantity ?? 1)),
    }))
    .filter((l) => l.name.length > 0);
}

/** Owner: план выручки по записям за день/неделю, опционально по постам */
export async function buildPlannedRevenue(
  organizationId: string,
  period: PeriodKey,
  anchor = new Date(),
) {
  const { start, end } = periodBounds(period, anchor);

  const [posts, bookings] = await Promise.all([
    prisma.servicePost.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        organizationId,
        startsAt: { gte: start, lte: end },
      },
      include: { lines: true, post: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const active = bookings.filter((b) =>
    ACTIVE_BOOKING.has(String(b.status)),
  );

  const byPost = posts.map((post) => {
    const list = active.filter((b) => b.postId === post.id);
    const planned = list.reduce((sum, b) => sum + b.plannedAmountRub, 0);
    return {
      postId: post.id,
      postName: post.name,
      bookingCount: list.length,
      plannedAmountRub: planned,
      bookings: list.map((b) => ({
        id: b.id,
        serviceName: b.serviceName,
        plannedAmountRub: b.plannedAmountRub,
        startsAt: b.startsAt,
        status: String(b.status),
        vehicleInfo: b.vehicleInfo,
      })),
    };
  });

  const unassigned = active.filter((b) => !b.postId);
  const unassignedPlanned = unassigned.reduce(
    (sum, b) => sum + b.plannedAmountRub,
    0,
  );

  const totalPlanned = active.reduce((sum, b) => sum + b.plannedAmountRub, 0);

  return {
    start,
    end,
    period,
    totalPlanned,
    bookingCount: active.length,
    byPost,
    unassigned: {
      bookingCount: unassigned.length,
      plannedAmountRub: unassignedPlanned,
    },
  };
}
