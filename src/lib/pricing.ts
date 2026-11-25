/** Цена услуги с учётом класса автомобиля (базовая — fallback). */
export function resolveServicePriceRub(
  service: {
    priceRub: number;
    classPrices?: { vehicleClassId: string; priceRub: number }[];
  },
  vehicleClassId: string | null | undefined,
): number {
  if (!vehicleClassId || !service.classPrices?.length) {
    return service.priceRub;
  }
  const match = service.classPrices.find(
    (p) => p.vehicleClassId === vehicleClassId,
  );
  return match?.priceRub ?? service.priceRub;
}

/** Подпись класса для UI. */
export function vehicleClassLabel(
  vehicleClass: { code: string; name: string } | null | undefined,
): string {
  if (!vehicleClass) return "Без класса";
  return `${vehicleClass.code} · ${vehicleClass.name}`;
}
