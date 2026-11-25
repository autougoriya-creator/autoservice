/** Нормализация телефона: только цифры и ведущий +. Идентификатор клиента в тенанте. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus || digits.length >= 11 ? `+${digits.replace(/^\+/, "")}` : digits;
}

export function phoneDigits(phone: string): string {
  return normalizePhone(phone).replace(/\D/g, "");
}
