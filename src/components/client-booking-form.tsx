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
import { resolveServicePriceRub } from "@/lib/pricing";
import { formatDuration } from "@/lib/work-order";
import {
  bookingDayKeys,
  buildDaySlots,
  localDayKey,
  parseLocalDayKey,
  type BusyInterval,
  type PostShiftCover,
} from "@/lib/client-slots";

type VehicleOption = {
  id: string;
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

type PostOption = {
  id: string;
  name: string;
  workStartHour?: number;
  workEndHour?: number;
};

type BusyPayload = {
  startsAtIso: string;
  durationMin: number;
  postId: string;
};

type ShiftPayload = {
  postId: string;
  startsAtIso: string;
  endsAtIso: string;
};

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function formatDayHeading(dayKey: string) {
  const d = parseLocalDayKey(dayKey);
  if (!d) return dayKey;
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

function calendarCells(dayKeys: string[]) {
  if (dayKeys.length === 0) return [];
  const first = parseLocalDayKey(dayKeys[0]);
  if (!first) return dayKeys.map((key) => ({ key, inHorizon: true }));

  // Monday-first padding
  const weekday = (first.getDay() + 6) % 7;
  const cells: { key: string | null; inHorizon: boolean }[] = [];
  for (let i = 0; i < weekday; i++) cells.push({ key: null, inHorizon: false });
  for (const key of dayKeys) cells.push({ key, inHorizon: true });
  while (cells.length % 7 !== 0) cells.push({ key: null, inHorizon: false });
  return cells;
}

export function ClientBookingForm({
  vehicles,
  services,
  posts,
  busy,
  shifts,
  phone,
}: {
  vehicles: VehicleOption[];
  services: ServiceOption[];
  posts: PostOption[];
  busy: BusyPayload[];
  shifts: ShiftPayload[];
  phone: string;
}) {
  const dayKeys = useMemo(() => bookingDayKeys(new Date(), 14), []);
  const todayKey = localDayKey(new Date());

  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(() =>
    services[0] ? [services[0].id] : [],
  );
  const [dayKey, setDayKey] = useState(dayKeys[0] ?? todayKey);
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

  const shiftCovers: PostShiftCover[] = useMemo(
    () =>
      shifts.map((s) => ({
        postId: s.postId,
        startsAt: new Date(s.startsAtIso),
        endsAt: new Date(s.endsAtIso),
      })),
    [shifts],
  );

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const selectedServices = services.filter((s) =>
    selectedServiceIds.includes(s.id),
  );

  const durationMin = Math.max(
    15,
    selectedServices.reduce((sum, s) => sum + s.durationMin, 0),
  );
  const priceRub = selectedServices.reduce(
    (sum, s) =>
      sum + resolveServicePriceRub(s, selectedVehicle?.vehicleClassId),
    0,
  );

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => {
      const on = prev.includes(id);
      if (on) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
    setSlotKey("");
  }

  const daySlots = useMemo(
    () =>
      buildDaySlots({
        dayKey,
        posts,
        busy: busyIntervals,
        durationMin,
        shifts: shiftCovers,
      }),
    [dayKey, posts, busyIntervals, durationMin, shiftCovers],
  );

  const freeByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const key of dayKeys) {
      const free = buildDaySlots({
        dayKey: key,
        posts,
        busy: busyIntervals,
        durationMin,
        shifts: shiftCovers,
      }).filter((s) => s.available).length;
      map.set(key, free);
    }
    return map;
  }, [dayKeys, posts, busyIntervals, durationMin, shiftCovers]);

  const availableSlots = daySlots.filter((s) => s.available && s.postId);
  const selectedSlot =
    availableSlots.find((s) => `${s.startsAtIso}|${s.postId}` === slotKey) ??
    null;

  const cells = useMemo(() => calendarCells(dayKeys), [dayKeys]);
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
                  {v.vehicleClass ? ` · кл. ${v.vehicleClass.code}` : ""}
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
                {vehicles[0].vehicleClass
                  ? ` · кл. ${vehicles[0].vehicleClass.code}`
                  : ""}
              </span>
            </p>
          </>
        )}

        <div>
          <p className="mb-1.5 text-sm font-semibold text-[var(--ink)]">
            Услуги
          </p>
          <p className="mb-2 text-xs text-[var(--ink-soft)]">
            Можно выбрать несколько — как «добавить услугу» в заказе. Длительность
            и сумма сложатся.
          </p>
          <ul className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--paper)]/50 p-3">
            {services.map((s) => {
              const on = selectedServiceIds.includes(s.id);
              const p = resolveServicePriceRub(
                s,
                selectedVehicle?.vehicleClassId,
              );
              return (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="serviceIds"
                      value={s.id}
                      checked={on}
                      onChange={() => toggleService(s.id)}
                      className="mt-1"
                    />
                    <span className="flex-1">
                      <span className="font-medium text-[var(--ink)]">
                        {s.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                        {formatRub(p)} · {formatDuration(s.durationMin)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-[var(--ink)]">Дата</p>
          <p className="mb-3 text-xs text-[var(--ink-soft)]">
            Выберите день, затем свободное время. Занятые слоты серые.
          </p>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)]/50 p-3">
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, idx) => {
                if (!cell.key) {
                  return <span key={`pad-${idx}`} className="min-h-11" />;
                }
                const d = parseLocalDayKey(cell.key);
                const dayNum = d?.getDate() ?? "";
                const selected = cell.key === dayKey;
                const isToday = cell.key === todayKey;
                const freeCount = freeByDay.get(cell.key) ?? 0;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      setDayKey(cell.key!);
                      setSlotKey("");
                    }}
                    className={[
                      "min-h-11 rounded-lg border text-sm font-semibold transition",
                      selected
                        ? "border-[var(--ink)] bg-[var(--ink)] text-white shadow-sm"
                        : freeCount === 0
                          ? "border-transparent bg-white/50 text-[var(--ink-soft)]/70 hover:bg-white/80"
                          : "border-transparent bg-white/90 text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-deep)]",
                      isToday && !selected
                        ? "ring-1 ring-[var(--accent)]/50"
                        : "",
                    ].join(" ")}
                    aria-pressed={selected}
                    aria-label={formatDayHeading(cell.key)}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-sm capitalize text-[var(--ink-soft)]">
            {formatDayHeading(dayKey)}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-[var(--ink)]">Время</p>
          {daySlots.length === 0 ? (
            <p className="rounded-md border border-[var(--line)] bg-[var(--paper)]/60 px-3 py-3 text-sm text-[var(--ink-soft)]">
              На этот день слотов нет.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {daySlots.map((slot) => {
                const key =
                  slot.postId != null
                    ? `${slot.startsAtIso}|${slot.postId}`
                    : `busy-${slot.startsAtIso}`;
                const selected =
                  selectedSlot != null &&
                  `${selectedSlot.startsAtIso}|${selectedSlot.postId}` === key;
                if (!slot.available || !slot.postId) {
                  return (
                    <span
                      key={key}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--paper-deep)]/70 px-2 text-sm font-medium text-[var(--ink-soft)]/55 line-through"
                      title="Занято"
                      aria-disabled="true"
                    >
                      {slot.timeLabel}
                    </span>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSlotKey(key)}
                    className={[
                      "inline-flex min-h-11 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition",
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_8px_18px_rgba(196,92,38,0.25)]"
                        : "border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-deep)]",
                    ].join(" ")}
                    aria-pressed={selected}
                  >
                    {slot.timeLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedSlot && selectedSlot.postId ? (
          <>
            <input
              type="hidden"
              name="startsAtIso"
              value={selectedSlot.startsAtIso}
            />
            <input type="hidden" name="postId" value={selectedSlot.postId} />
          </>
        ) : null}

        <Field label="Комментарий" htmlFor="notes">
          <TextTextarea
            id="notes"
            name="notes"
            placeholder="Пожелания к мойке или детейлингу"
          />
        </Field>

        {selectedServices.length > 0 ? (
          <div className="rounded-lg bg-[var(--ink)] px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-[0.14em] text-white/60">
              К оплате на точке
            </p>
            <p className="brand-mark mt-1 text-2xl">
              {formatRub(priceRub)}
              <span className="ml-3 text-sm font-normal text-white/70">
                {formatDuration(durationMin)}
              </span>
            </p>
            <p className="mt-1 text-sm text-white/75">
              {selectedServices.map((s) => s.name).join(" · ")}
            </p>
            {selectedSlot ? (
              <p className="mt-2 text-sm text-white/75">
                {formatDayHeading(dayKey)} · {selectedSlot.timeLabel}
              </p>
            ) : null}
          </div>
        ) : null}

        <FormActions>
          {selectedSlot && selectedServices.length > 0 ? (
            <SubmitButton className="sm:w-auto" variant="primary">
              Записаться
            </SubmitButton>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">
              Выберите услуги, дату и свободное время, чтобы отправить заявку.
            </p>
          )}
        </FormActions>
      </form>
    </FormCard>
  );
}
