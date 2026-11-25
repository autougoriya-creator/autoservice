import { prisma } from "@/lib/prisma";
import { periodBounds, type PeriodKey } from "@/lib/payroll";

/**
 * Простая сводка для OWNER: записи, закрытые через ЗН, vs отменённые.
 */
export async function buildBookingOutcomeSummary(
  organizationId: string,
  period: PeriodKey = "week",
  anchor = new Date(),
) {
  const { start, end } = periodBounds(period, anchor);

  const bookings = await prisma.booking.findMany({
    where: {
      organizationId,
      startsAt: { gte: start, lte: end },
    },
    include: {
      workOrder: { select: { id: true, status: true, number: true } },
    },
  });

  let openCount = 0;
  let withWorkOrderCount = 0;
  let closedViaWorkOrderCount = 0;
  let cancelledCount = 0;
  const cancelReasons: { reason: string; count: number }[] = [];
  const reasonMap = new Map<string, number>();

  for (const b of bookings) {
    if (b.status === "CANCELLED") {
      cancelledCount += 1;
      const reason = (b.cancelReason || "Без причины").trim();
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
      continue;
    }
    if (b.workOrderId && b.workOrder) {
      withWorkOrderCount += 1;
      if (b.workOrder.status === "CLOSED") {
        closedViaWorkOrderCount += 1;
      }
      continue;
    }
    openCount += 1;
  }

  for (const [reason, count] of reasonMap) {
    cancelReasons.push({ reason, count });
  }
  cancelReasons.sort((a, b) => b.count - a.count);

  return {
    start,
    end,
    period,
    total: bookings.length,
    openCount,
    withWorkOrderCount,
    closedViaWorkOrderCount,
    cancelledCount,
    cancelReasons: cancelReasons.slice(0, 8),
  };
}
