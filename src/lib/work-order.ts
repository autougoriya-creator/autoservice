import type { WorkOrderStatus } from "@prisma/client";

export function workOrderNumberLabel(number: number) {
  return `ЗН-${String(number).padStart(4, "0")}`;
}

export function workOrderTotal(
  lines: { priceRub: number; quantity: number }[],
) {
  return lines.reduce((sum, line) => sum + line.priceRub * line.quantity, 0);
}

export function workOrderDuration(
  lines: { durationMin: number; quantity: number }[],
) {
  return lines.reduce((sum, line) => sum + line.durationMin * line.quantity, 0);
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Статусы ЗН: в работе → закрыт (без пересечения со статусами записи) */
export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "IN_PROGRESS",
  "CLOSED",
];

/** Допустимые следующие статусы (без «оставить как есть»). */
export function nextWorkOrderStatuses(
  from: WorkOrderStatus,
): WorkOrderStatus[] {
  switch (from) {
    case "IN_PROGRESS":
      return ["CLOSED"];
    case "CLOSED":
      return [];
    default:
      return [];
  }
}

export function canTransitionWorkOrderStatus(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): boolean {
  if (from === to) return true;
  return nextWorkOrderStatuses(from).includes(to);
}

/** Статусы для селекта: текущий + допустимые переходы */
export function selectableWorkOrderStatuses(
  current: WorkOrderStatus,
): WorkOrderStatus[] {
  const next = nextWorkOrderStatuses(current);
  return [current, ...next.filter((s) => s !== current)];
}
