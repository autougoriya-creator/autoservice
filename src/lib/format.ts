const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatRub(amount: number) {
  return rubFormatter.format(amount);
}

export function formatDateTime(date: Date) {
  return dateTimeFormatter.format(date);
}

export function formatDate(date: Date) {
  return dateFormatter.format(date);
}

export const bookingStatusLabel: Record<string, string> = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждена",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
  CANCELLED: "Отменена",
};

export const roleLabel: Record<string, string> = {
  OWNER: "Владелец",
  STAFF: "Персонал",
  CLIENT: "Клиент",
};
