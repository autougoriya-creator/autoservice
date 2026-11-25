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

/** Порядок статусов: NEW / NEW_FROM_CLIENT → CONFIRMED → IN_PROGRESS → CLOSED */
export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "NEW",
  "NEW_FROM_CLIENT",
  "CONFIRMED",
  "IN_PROGRESS",
  "CLOSED",
];

/** Допустимые следующие статусы (без «оставить как есть»). */
export function nextWorkOrderStatuses(
  from: WorkOrderStatus,
): WorkOrderStatus[] {
  switch (from) {
    case "NEW":
      return ["CONFIRMED", "IN_PROGRESS"];
    case "NEW_FROM_CLIENT":
      return ["CONFIRMED", "IN_PROGRESS"];
    case "CONFIRMED":
      return ["IN_PROGRESS"];
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

/** При заезде ТС: из нового / от клиента / подтверждённого → в работе */
export function canMarkWorkOrderInProgress(status: WorkOrderStatus): boolean {
  return (
    status === "NEW" ||
    status === "NEW_FROM_CLIENT" ||
    status === "CONFIRMED"
  );
}

/** Статусы для селекта: текущий + допустимые переходы */
export function selectableWorkOrderStatuses(
  current: WorkOrderStatus,
): WorkOrderStatus[] {
  const next = nextWorkOrderStatuses(current);
  return [current, ...next.filter((s) => s !== current)];
}
