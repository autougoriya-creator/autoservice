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
