import type { BookingStatus } from "@prisma/client";

/** Статусы записи: новая / новая от клиента / подтверждена (+ отмена) */
export const BOOKING_STATUSES: BookingStatus[] = [
  "NEW",
  "NEW_FROM_CLIENT",
  "CONFIRMED",
  "CANCELLED",
];

/** Записи на графике (без отменённых) */
export const BOARD_BOOKING_STATUSES = new Set<string>([
  "NEW",
  "NEW_FROM_CLIENT",
  "CONFIRMED",
]);

/** Допустимые переходы статуса записи (кроме отмены — отдельное действие) */
export function nextBookingStatuses(from: BookingStatus): BookingStatus[] {
  switch (from) {
    case "NEW":
      return ["CONFIRMED"];
    case "NEW_FROM_CLIENT":
      return ["CONFIRMED"];
    case "CONFIRMED":
      return [];
    case "CANCELLED":
      return [];
    default:
      return [];
  }
}

export function canTransitionBookingStatus(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  if (from === to) return true;
  if (to === "CANCELLED") return from !== "CANCELLED";
  return nextBookingStatuses(from).includes(to);
}

/** Можно создать ЗН из записи (клиент приехал) */
export function canCreateWorkOrderFromBooking(opts: {
  status: BookingStatus;
  workOrderId?: string | null;
}): boolean {
  if (opts.workOrderId) return false;
  return (
    opts.status === "NEW" ||
    opts.status === "NEW_FROM_CLIENT" ||
    opts.status === "CONFIRMED"
  );
}

export function selectableBookingStatuses(
  current: BookingStatus,
): BookingStatus[] {
  const next = nextBookingStatuses(current);
  return [current, ...next.filter((s) => s !== current)];
}
