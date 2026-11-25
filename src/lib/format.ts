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
  ADMIN: "Администратор",
  STAFF: "Сотрудник",
  CLIENT: "Клиент",
};

export const workOrderStatusLabel: Record<string, string> = {
  NEW: "Новый",
  NEW_FROM_CLIENT: "Новый от клиента",
  CONFIRMED: "Подтверждён",
  IN_PROGRESS: "В работе",
  CLOSED: "Закрыт",
};

export const paymentMethodLabel: Record<string, string> = {
  CASH: "Наличные",
  TERMINAL: "Терминал",
  INVOICE: "Счёт",
  CASH_AND_TERMINAL: "Нал + терминал",
};

export function workOrderStatusTone(
  status: string,
): "neutral" | "ok" | "warn" | "accent" {
  switch (status) {
    case "CLOSED":
      return "ok";
    case "IN_PROGRESS":
      return "accent";
    case "CONFIRMED":
      return "warn";
    case "NEW":
    case "NEW_FROM_CLIENT":
      return "warn";
    default:
      return "neutral";
  }
}
