"use client";

import { useMemo, useState } from "react";
import { addWorkOrderLine } from "@/app/actions/work-orders";
import { SubmitButton } from "@/components/ui";
import {
  Field,
  FormCard,
  TextInput,
  TextSelect,
} from "@/components/forms";
import { formatRub } from "@/lib/format";
import { resolveServicePriceRub } from "@/lib/pricing";
import { formatDuration } from "@/lib/work-order";

type ServiceOption = {
  id: string;
  name: string;
  priceRub: number;
  durationMin: number;
  classPrices: { vehicleClassId: string; priceRub: number }[];
};

export function WorkOrderAddLineForm({
  workOrderId,
  vehicleClassId,
  services,
}: {
  workOrderId: string;
  vehicleClassId: string | null;
  services: ServiceOption[];
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [durationMin, setDurationMin] = useState(
    services[0]?.durationMin ?? 30,
  );
  const [quantity, setQuantity] = useState(1);

  const selected = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const priceRub = selected
    ? resolveServicePriceRub(selected, vehicleClassId)
    : 0;
  const normMin = selected?.durationMin ?? 0;

  function onServiceChange(id: string) {
    setServiceId(id);
    const next = services.find((s) => s.id === id);
    if (next) setDurationMin(next.durationMin);
  }

  function onDurationChange(raw: string) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      setDurationMin(normMin);
      return;
    }
    setDurationMin(Math.max(normMin, n));
  }

  if (services.length === 0) {
    return (
      <FormCard>
        <p className="text-sm text-[var(--ink-soft)]">
          Нет активных услуг для добавления. Добавьте услуги в справочник.
        </p>
      </FormCard>
    );
  }

  return (
    <FormCard>
      <h2 className="brand-mark mb-2 text-lg">Добавить услугу</h2>
      <p className="mb-4 text-sm text-[var(--ink-soft)]">
        Мойщик — по просьбе клиента; администратор — при проверке и проведении.
        Цена считается по классу автомобиля.
      </p>
      <form action={addWorkOrderLine} className="space-y-4">
        <input type="hidden" name="workOrderId" value={workOrderId} />
        <Field label="Услуга" htmlFor="serviceId">
          <TextSelect
            id="serviceId"
            name="serviceId"
            required
            value={serviceId}
            onChange={(e) => onServiceChange(e.target.value)}
          >
            {services.map((s) => {
              const p = resolveServicePriceRub(s, vehicleClassId);
              return (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatRub(p)} · норма{" "}
                  {formatDuration(s.durationMin)}
                </option>
              );
            })}
          </TextSelect>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Время, мин"
            htmlFor="durationMin"
            hint={`не меньше нормы ${normMin}`}
          >
            <TextInput
              id="durationMin"
              name="durationMin"
              required
              inputMode="numeric"
              value={String(durationMin)}
              onChange={(e) => onDurationChange(e.target.value)}
              onBlur={(e) => onDurationChange(e.target.value)}
            />
          </Field>
          <Field label="Количество" htmlFor="quantity">
            <TextInput
              id="quantity"
              name="quantity"
              required
              inputMode="numeric"
              value={String(quantity)}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setQuantity(Number.isFinite(n) && n > 0 ? n : 1);
              }}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--ink-soft)]">
            Сумма строки:{" "}
            <span className="font-semibold text-[var(--ink)]">
              {formatRub(priceRub * quantity)}
            </span>
          </p>
          <SubmitButton>Добавить в заказ</SubmitButton>
        </div>
      </form>
    </FormCard>
  );
}
