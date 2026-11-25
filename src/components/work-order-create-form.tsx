"use client";

import { useEffect, useMemo, useState } from "react";
import { createWorkOrder } from "@/app/actions/work-orders";
import { SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
  TextTextarea,
} from "@/components/forms";
import { formatRub } from "@/lib/format";
import { resolveServicePriceRub, vehicleClassLabel } from "@/lib/pricing";
import { formatDuration } from "@/lib/work-order";

type CustomerOption = { id: string; name: string; phone: string };
type VehicleOption = {
  id: string;
  customerId: string;
  make: string;
  model: string;
  plate: string;
  vehicleClassId: string | null;
  vehicleClass: { code: string; name: string } | null;
};
type ServiceOption = {
  id: string;
  name: string;
  priceRub: number;
  durationMin: number;
  classPrices: { vehicleClassId: string; priceRub: number }[];
};

export function WorkOrderCreateForm({
  customers,
  vehicles,
  services,
  initialCustomerId,
  initialVehicleId,
}: {
  customers: CustomerOption[];
  vehicles: VehicleOption[];
  services: ServiceOption[];
  initialCustomerId?: string;
  initialVehicleId?: string;
}) {
  const [customerId, setCustomerId] = useState(
    initialCustomerId ?? customers[0]?.id ?? "",
  );
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  /** Длительность по услуге: норма + ручное увеличение админом */
  const [durations, setDurations] = useState<Record<string, number>>({});

  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.customerId === customerId),
    [vehicles, customerId],
  );

  const effectiveVehicleId = customerVehicles.some((v) => v.id === vehicleId)
    ? vehicleId
    : (customerVehicles[0]?.id ?? "");

  const selectedVehicle = customerVehicles.find(
    (v) => v.id === effectiveVehicleId,
  );
  const vehicleClassId = selectedVehicle?.vehicleClassId ?? null;

  const pricedServices = useMemo(
    () =>
      services.map((s) => ({
        ...s,
        effectivePriceRub: resolveServicePriceRub(s, vehicleClassId),
      })),
    [services, vehicleClassId],
  );

  const selectedServices = pricedServices.filter((s) => selected[s.id]);

  // При выборе услуги подставляем норму времени
  useEffect(() => {
    setDurations((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of services) {
        if (selected[s.id] && next[s.id] == null) {
          next[s.id] = s.durationMin;
          changed = true;
        }
        if (!selected[s.id] && next[s.id] != null) {
          delete next[s.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selected, services]);

  const total = selectedServices.reduce(
    (sum, s) => sum + s.effectivePriceRub,
    0,
  );
  const duration = selectedServices.reduce(
    (sum, s) => sum + (durations[s.id] ?? s.durationMin),
    0,
  );

  function setDurationMin(serviceId: string, normMin: number, raw: string) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      setDurations((prev) => ({ ...prev, [serviceId]: normMin }));
      return;
    }
    // Админ может увеличить норму, но не уменьшить ниже нормы
    setDurations((prev) => ({
      ...prev,
      [serviceId]: Math.max(normMin, n),
    }));
  }

  return (
    <FormCard>
      <form action={createWorkOrder} className="space-y-5">
        <Field label="Клиент" htmlFor="customerId">
          <TextSelect
            id="customerId"
            name="customerId"
            required
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setVehicleId("");
            }}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.phone} · {c.name}
              </option>
            ))}
          </TextSelect>
        </Field>

        <Field
          label="Автомобиль"
          htmlFor="vehicleId"
          hint={
            selectedVehicle
              ? `Класс: ${vehicleClassLabel(selectedVehicle.vehicleClass)}`
              : undefined
          }
        >
          <TextSelect
            id="vehicleId"
            name="vehicleId"
            required
            value={effectiveVehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            disabled={customerVehicles.length === 0}
          >
            {customerVehicles.length === 0 ? (
              <option value="">Нет авто у клиента</option>
            ) : (
              customerVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.plate}
                  {v.vehicleClass ? ` · кл. ${v.vehicleClass.code}` : ""}
                </option>
              ))
            )}
          </TextSelect>
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">
            Услуги
          </legend>
          <p className="mb-3 text-xs text-[var(--ink-soft)]">
            Цена — по классу авто. Время подставляется из нормы; при приёмке
            можно увеличить.
          </p>
          <ul className="space-y-2">
            {pricedServices.map((service) => {
              const isOn = Boolean(selected[service.id]);
              const durationValue = durations[service.id] ?? service.durationMin;
              return (
                <li key={service.id}>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--paper)]/60 px-3 py-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        name="serviceIds"
                        value={service.id}
                        checked={isOn}
                        onChange={(e) =>
                          setSelected((prev) => ({
                            ...prev,
                            [service.id]: e.target.checked,
                          }))
                        }
                        className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="flex-1">
                        <span className="block font-medium text-[var(--ink)]">
                          {service.name}
                        </span>
                        <span className="text-xs text-[var(--ink-soft)]">
                          {formatRub(service.effectivePriceRub)} · норма{" "}
                          {formatDuration(service.durationMin)}
                        </span>
                      </span>
                    </label>
                    {isOn ? (
                      <div className="mt-3 ml-7 max-w-[12rem]">
                        <Field
                          label="Время, мин"
                          htmlFor={`durationMin_${service.id}`}
                          hint={`не меньше нормы ${service.durationMin}`}
                        >
                          <TextInput
                            id={`durationMin_${service.id}`}
                            name={`durationMin_${service.id}`}
                            required
                            inputMode="numeric"
                            value={String(durationValue)}
                            onChange={(e) =>
                              setDurationMin(
                                service.id,
                                service.durationMin,
                                e.target.value,
                              )
                            }
                            onBlur={(e) =>
                              setDurationMin(
                                service.id,
                                service.durationMin,
                                e.target.value,
                              )
                            }
                          />
                        </Field>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <Field label="Комментарий" htmlFor="notes">
          <TextTextarea
            id="notes"
            name="notes"
            placeholder="Пожелания клиента, пост, детали"
          />
        </Field>

        <div className="rounded-lg bg-[var(--ink)] px-4 py-3 text-white">
          <p className="text-xs uppercase tracking-[0.14em] text-white/60">
            Итого
          </p>
          <p className="brand-mark mt-1 text-2xl">
            {formatRub(total)}
            <span className="ml-3 text-sm font-normal text-white/70">
              {formatDuration(duration)}
            </span>
          </p>
        </div>

        <FormActions>
          <SubmitButton className="sm:w-auto" variant="primary">
            Создать заказ-наряд
          </SubmitButton>
        </FormActions>
      </form>
    </FormCard>
  );
}
