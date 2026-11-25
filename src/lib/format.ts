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
  NEW: "Новая",
  NEW_FROM_CLIENT: "Новая от клиента",
  CONFIRMED: "Подтверждена",
  CANCELLED: "Отменена",
};

export function bookingStatusTone(
  status: string,
): "neutral" | "ok" | "warn" | "accent" {
  switch (status) {
    case "CONFIRMED":
      return "ok";
    case "NEW":
    case "NEW_FROM_CLIENT":
      return "warn";
    case "CANCELLED":
      return "neutral";
    default:
      return "neutral";
  }
}

export const roleLabel: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  STAFF: "Сотрудник",
  CLIENT: "Клиент",
};

export const workOrderStatusLabel: Record<string, string> = {
  IN_PROGRESS: "В работе",
  CLOSED: "Закрыт",
};

export const paymentMethodLabel: Record<string, string> = {
  CASH: "Наличные",
  TERMINAL: "Терминал",
  INVOICE: "Счёт",
  CASH_AND_TERMINAL: "Нал + терминал",
};

export const stockMovementLabel: Record<string, string> = {
  RECEIPT: "Поступление",
  CONSUMPTION: "Расход",
  INVENTORY: "Инвентаризация",
};

export function workOrderStatusTone(
  status: string,
): "neutral" | "ok" | "warn" | "accent" {
  switch (status) {
    case "CLOSED":
      return "ok";
    case "IN_PROGRESS":
      return "accent";
    default:
      return "neutral";
  }
}
