"use client";

import { useEffect, useMemo, useState } from "react";
import { addWorkOrderLine } from "@/app/actions/work-orders";
import { SubmitButton } from "@/components/ui";
import { Field, TextInput, TextSelect } from "@/components/forms";
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

export function WorkOrderAddLineButton({
  workOrderId,
  vehicleClassId,
  services,
}: {
  workOrderId: string;
  vehicleClassId: string | null;
  services: ServiceOption[];
}) {
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

  function openDialog() {
    const first = services[0];
    setServiceId(first?.id ?? "");
    setDurationMin(first?.durationMin ?? 30);
    setQuantity(1);
    setOpen(true);
  }

  if (services.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-soft)]">
        Нет активных услуг для добавления. Добавьте услуги в справочник.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(196,92,38,0.28)] hover:bg-[var(--accent-deep)]"
      >
        Добавить услугу
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/45 p-3 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-service-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_24px_60px_rgba(20,32,42,0.28)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  Заказ-наряд
                </p>
                <h2
                  id="add-service-title"
                  className="brand-mark mt-1 text-2xl text-[var(--ink)]"
                >
                  Добавить услугу
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Цена считается по классу автомобиля. Мойщик — по просьбе
                  клиента; администратор — при проверке.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 shrink-0 cursor-pointer rounded-md border border-[var(--line)] px-4 text-sm font-semibold"
              >
                Закрыть
              </button>
            </div>

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
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                <p className="text-sm text-[var(--ink-soft)]">
                  Сумма строки:{" "}
                  <span className="font-semibold text-[var(--ink)]">
                    {formatRub(priceRub * quantity)}
                  </span>
                </p>
                <SubmitButton className="w-auto sm:min-w-[180px]">
                  Добавить в заказ
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
