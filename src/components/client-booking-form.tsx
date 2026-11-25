"use client";

import { useMemo, useState } from "react";
import { createClientSelfBooking } from "@/app/actions/client-booking";
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
import { buildClientSlots, type BusyInterval } from "@/lib/client-slots";

type VehicleOption = {
  id: string;
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

type PostOption = { id: string; name: string };

type BusyPayload = {
  startsAtIso: string;
  durationMin: number;
  postId: string;
};

export function ClientBookingForm({
  vehicles,
  services,
  posts,
  busy,
  phone,
}: {
  vehicles: VehicleOption[];
  services: ServiceOption[];
  posts: PostOption[];
  busy: BusyPayload[];
  phone: string;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [slotKey, setSlotKey] = useState("");

  const busyIntervals: BusyInterval[] = useMemo(
    () =>
      busy.map((b) => ({
        startsAt: new Date(b.startsAtIso),
        durationMin: b.durationMin,
        postId: b.postId,
      })),
    [busy],
  );

  const selectedService = services.find((s) => s.id === serviceId);
  const durationMin = selectedService?.durationMin ?? 30;

  const slots = useMemo(
    () =>
      buildClientSlots({
        posts,
        busy: busyIntervals,
        durationMin,
      }),
    [posts, busyIntervals, durationMin],
  );

  const effectiveSlot =
    slots.find((s) => `${s.startsAtIso}|${s.postId}` === slotKey) ?? slots[0];

  const showVehicleSelect = vehicles.length > 1;

  if (vehicles.length === 0) {
    return (
      <FormCard>
        <p className="text-sm text-[var(--ink-soft)]">
          У вас пока нет автомобилей в профиле. Добавьте авто у администратора
          точки — затем можно записаться онлайн.
        </p>
      </FormCard>
    );
  }

  if (services.length === 0) {
    return (
      <FormCard>
        <p className="text-sm text-[var(--ink-soft)]">
          Сейчас нет доступных услуг для онлайн-записи.
        </p>
      </FormCard>
    );
  }

  return (
    <FormCard className="max-w-xl">
      <form action={createClientSelfBooking} className="space-y-5">
        <p className="rounded-lg bg-[var(--paper)]/80 px-3 py-2 text-sm text-[var(--ink-soft)]">
          Клиент: <span className="font-semibold text-[var(--ink)]">{phone}</span>
        </p>

        {showVehicleSelect ? (
          <Field label="Автомобиль" htmlFor="vehicleId">
            <TextSelect
              id="vehicleId"
              name="vehicleId"
              required
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.plate}
                </option>
              ))}
            </TextSelect>
          </Field>
        ) : (
          <>
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <p className="text-sm text-[var(--ink-soft)]">
              Автомобиль:{" "}
              <span className="font-semibold text-[var(--ink)]">
                {vehicles[0].make} {vehicles[0].model} · {vehicles[0].plate}
              </span>
            </p>
          </>
        )}

        <Field label="Услуга" htmlFor="serviceId">
          <TextSelect
            id="serviceId"
            name="serviceId"
            required
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlotKey("");
            }}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatRub(s.priceRub)} ·{" "}
                {formatDuration(s.durationMin)}
              </option>
            ))}
          </TextSelect>
        </Field>

        <Field
          label="Время"
          htmlFor="slotKey"
          hint="Свободные слоты на 7 дней, шаг 15 мин (08:00–20:00)"
        >
          {slots.length === 0 ? (
            <p className="rounded-md border border-[var(--line)] bg-[var(--paper)]/60 px-3 py-3 text-sm text-[var(--ink-soft)]">
              На ближайшие дни свободных слотов нет. Попробуйте позже или
              позвоните в точку.
            </p>
          ) : (
            <TextSelect
              id="slotKey"
              required
              value={
                effectiveSlot
                  ? `${effectiveSlot.startsAtIso}|${effectiveSlot.postId}`
                  : ""
              }
              onChange={(e) => setSlotKey(e.target.value)}
            >
              {slots.map((s) => (
                <option
                  key={`${s.startsAtIso}|${s.postId}`}
                  value={`${s.startsAtIso}|${s.postId}`}
                >
                  {s.label}
                </option>
              ))}
            </TextSelect>
          )}
        </Field>

        {effectiveSlot ? (
          <>
            <input
              type="hidden"
              name="startsAtIso"
              value={effectiveSlot.startsAtIso}
            />
            <input type="hidden" name="postId" value={effectiveSlot.postId} />
          </>
        ) : null}

        <Field label="Комментарий" htmlFor="notes">
          <TextTextarea
            id="notes"
            name="notes"
            placeholder="Пожелания к мойке или детейлингу"
          />
        </Field>

        {selectedService ? (
          <div className="rounded-lg bg-[var(--ink)] px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-[0.14em] text-white/60">
              К оплате на точке
            </p>
            <p className="brand-mark mt-1 text-2xl">
              {formatRub(selectedService.priceRub)}
              <span className="ml-3 text-sm font-normal text-white/70">
                {formatDuration(selectedService.durationMin)}
              </span>
            </p>
          </div>
        ) : null}

        <FormActions>
          {effectiveSlot ? (
            <SubmitButton className="sm:w-auto" variant="primary">
              Записаться
            </SubmitButton>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">
              Выберите свободный слот, чтобы отправить заявку.
            </p>
          )}
        </FormActions>
      </form>
    </FormCard>
  );
}
