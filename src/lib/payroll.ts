import { workOrderTotal } from "@/lib/work-order";

export type PayModeValue = "DEAL" | "SALARY";

export function payModeLabel(mode: string) {
  return mode === "SALARY" ? "Оклад" : "Сделка %";
}

export function daysInRange(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function uniqueShiftDays(
  shifts: { startsAt: Date; endsAt: Date }[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  const days = new Set<string>();
  for (const shift of shifts) {
    const from = new Date(Math.max(shift.startsAt.getTime(), rangeStart.getTime()));
    const to = new Date(Math.min(shift.endsAt.getTime(), rangeEnd.getTime()));
    if (to < from) continue;
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(to);
    last.setHours(0, 0, 0, 0);
    while (cursor <= last) {
      days.add(
        `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`,
      );
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return days.size;
}

/** Monthly salary prorated by calendar days worked in period (shift-days). */
export function salaryCostForPeriod(
  salaryRub: number,
  shiftDays: number,
) {
  if (salaryRub <= 0 || shiftDays <= 0) return 0;
  return Math.round((salaryRub / 30) * shiftDays);
}

export function dealCostForRevenue(revenueRub: number, dealPercent: number) {
  if (revenueRub <= 0 || dealPercent <= 0) return 0;
  return Math.round((revenueRub * dealPercent) / 100);
}

export function sumWorkOrderRevenue(
  workOrders: { lines: { priceRub: number; quantity: number }[] }[],
) {
  return workOrders.reduce((sum, wo) => sum + workOrderTotal(wo.lines), 0);
}

export type PeriodKey = "day" | "week";

export function periodBounds(period: PeriodKey, anchor = new Date()) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (period === "week") {
    const day = (start.getDay() + 6) % 7; // Monday=0
    start.setDate(start.getDate() - day);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  }
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
