"use client";

import { useMemo, useState } from "react";
import { createWorkOrder } from "@/app/actions/work-orders";
import { SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextSelect,
  TextTextarea,
} from "@/components/forms";
import { formatRub } from "@/lib/format";
import { formatDuration } from "@/lib/work-order";

type CustomerOption = { id: string; name: string; phone: string };
type VehicleOption = {
  id: string;
  customerId: string;
  make: string;
  model: string;
  plate: string;
};
type ServiceOption = {
  id: string;
  name: string;
  priceRub: number;
  durationMin: number;
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

  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.customerId === customerId),
    [vehicles, customerId],
  );

  const effectiveVehicleId = customerVehicles.some((v) => v.id === vehicleId)
    ? vehicleId
    : (customerVehicles[0]?.id ?? "");

  const selectedServices = services.filter((s) => selected[s.id]);
  const total = selectedServices.reduce((sum, s) => sum + s.priceRub, 0);
  const duration = selectedServices.reduce((sum, s) => sum + s.durationMin, 0);

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

        <Field label="Автомобиль" htmlFor="vehicleId">
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
                </option>
              ))
            )}
          </TextSelect>
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">
            Услуги
          </legend>
          <ul className="space-y-2">
            {services.map((service) => (
              <li key={service.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--paper)]/60 px-3 py-3">
                  <input
                    type="checkbox"
                    name="serviceIds"
                    value={service.id}
                    checked={Boolean(selected[service.id])}
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
                      {formatRub(service.priceRub)} ·{" "}
                      {formatDuration(service.durationMin)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
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
          <SubmitButton
            className="sm:w-auto"
            variant="primary"
          >
            Создать заказ-наряд
          </SubmitButton>
        </FormActions>
      </form>
    </FormCard>
  );
}
