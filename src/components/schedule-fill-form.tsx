"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyBulkFillStaffShifts,
  previewBulkFillStaffShifts,
  type BulkFillConflict,
  type BulkFillInput,
} from "@/app/actions/staff";
import { WEEKDAY_LABELS, type WeekdayMode } from "@/lib/schedule-fill";
import { FormCard } from "@/components/forms";

type PostOpt = {
  id: string;
  name: string;
  hoursLabel: string;
};

type StaffOpt = {
  id: string;
  name: string;
  title: string;
};

function formatConflictWhen(isoStart: string, isoEnd: string) {
  const s = new Date(isoStart);
  const e = new Date(isoEnd);
  const day = s.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day} · ${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

export function ScheduleFillForm({
  posts,
  staff,
  defaultFromDate,
  defaultToDate,
}: {
  posts: PostOpt[];
  staff: StaffOpt[];
  defaultFromDate: string;
  defaultToDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [postId, setPostId] = useState("");
  const [weekdayMode, setWeekdayMode] = useState<WeekdayMode>("weekdays");
  const [customWeekdays, setCustomWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<BulkFillConflict[] | null>(null);
  const [plannedCount, setPlannedCount] = useState(0);

  const input: BulkFillInput = useMemo(
    () => ({
      postId,
      weekdayMode,
      customWeekdays,
      fromDate,
      toDate,
      staffProfileIds: staffIds,
    }),
    [postId, weekdayMode, customWeekdays, fromDate, toDate, staffIds],
  );

  function toggleStaff(id: string) {
    setStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleWeekday(value: number) {
    setCustomWeekdays((prev) =>
      prev.includes(value)
        ? prev.filter((x) => x !== value)
        : [...prev, value].sort((a, b) => a - b),
    );
  }

  function buildInput(): BulkFillInput | null {
    if (!postId) {
      setError("Выберите пост");
      return null;
    }
    if (staffIds.length === 0) {
      setError("Выберите хотя бы одного сотрудника");
      return null;
    }
    if (weekdayMode === "custom" && customWeekdays.length === 0) {
      setError("Выберите хотя бы один день недели");
      return null;
    }
    setError(null);
    return input;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildInput();
    if (!payload) return;
    setFlash(null);
    setConflicts(null);
    startTransition(async () => {
      const preview = await previewBulkFillStaffShifts(payload);
      if (!preview.ok) {
        setError(preview.error);
        return;
      }
      setPlannedCount(preview.plannedCount);
      if (preview.conflicts.length > 0) {
        setConflicts(preview.conflicts);
        return;
      }
      const applied = await applyBulkFillStaffShifts({
        ...payload,
        replaceExisting: false,
      });
      if (!applied.ok) {
        if (applied.conflicts?.length) {
          setConflicts(applied.conflicts);
          return;
        }
        setError(applied.error);
        return;
      }
      setFlash(`Создано смен: ${applied.created}`);
      router.refresh();
    });
  }

  function confirmOverwrite() {
    const payload = buildInput();
    if (!payload) return;
    startTransition(async () => {
      const applied = await applyBulkFillStaffShifts({
        ...payload,
        replaceExisting: true,
      });
      if (!applied.ok) {
        setError(applied.error);
        return;
      }
      setConflicts(null);
      setFlash(
        `Создано смен: ${applied.created}` +
          (applied.replaced > 0 ? ` · заменено: ${applied.replaced}` : ""),
      );
      router.refresh();
    });
  }

  function cancelConflicts() {
    setConflicts(null);
  }

  useEffect(() => {
    if (!conflicts) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancelConflicts();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conflicts]);

  return (
    <>
      <FormCard>
        <h2 className="brand-mark mb-1 text-lg">Заполнение графика работы</h2>
        <p className="mb-4 text-sm text-[var(--ink-soft)]">
          Смены по часам выбранного поста на период. Выбранные сотрудники
          закрепляются за постом. Администраторы в список не входят.
        </p>

        {flash ? (
          <p className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--teal-soft)]/50 px-4 py-3 text-sm text-[var(--ink)]">
            {flash}
          </p>
        ) : null}
        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold text-[var(--ink)]">
              Пост
            </span>
            <select
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              required
              className="min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-3"
            >
              <option value="" disabled>
                Выберите пост…
              </option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.hoursLabel}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold text-[var(--ink)]">
              Режим дней
            </span>
            <select
              value={weekdayMode}
              onChange={(e) => setWeekdayMode(e.target.value as WeekdayMode)}
              className="min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-3"
            >
              <option value="weekdays">Будни (пн–пт)</option>
              <option value="weekends">Выходные (сб–вс)</option>
              <option value="all">Все дни</option>
              <option value="custom">Свои дни недели</option>
            </select>
          </label>

          {weekdayMode === "custom" ? (
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-[var(--ink)]">
                Дни недели
              </legend>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_LABELS.map((wd) => (
                  <label
                    key={wd.value}
                    className="inline-flex items-center gap-2 text-sm text-[var(--ink)]"
                  >
                    <input
                      type="checkbox"
                      checked={customWeekdays.includes(wd.value)}
                      onChange={() => toggleWeekday(wd.value)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    {wd.short}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold text-[var(--ink)]">
                Период с
              </span>
              <input
                type="date"
                required
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-3"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold text-[var(--ink)]">
                по
              </span>
              <input
                type="date"
                required
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-3"
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-[var(--ink)]">
              Сотрудники
            </legend>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--line)] bg-white px-3 py-2">
              {staff.length === 0 ? (
                <p className="text-sm text-[var(--ink-soft)]">
                  Нет активных мойщиков/слесарей
                </p>
              ) : (
                staff.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 text-sm text-[var(--ink)]"
                  >
                    <input
                      type="checkbox"
                      checked={staffIds.includes(p.id)}
                      onChange={() => toggleStaff(p.id)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span>
                      {p.name}
                      <span className="text-[var(--ink-soft)]">
                        {" "}
                        · {p.title}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={pending || staff.length === 0}
              className="min-h-11 cursor-pointer rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(196,92,38,0.28)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
            >
              {pending ? "Проверка…" : "Заполнить период"}
            </button>
          </div>
        </form>
      </FormCard>

      {conflicts ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--ink)]/45 p-3 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-conflict-title"
          onClick={cancelConflicts}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_24px_60px_rgba(20,32,42,0.28)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Пересечения графика
            </p>
            <h2
              id="bulk-conflict-title"
              className="brand-mark mt-1 text-2xl text-[var(--ink)]"
            >
              Уже есть смены
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Планируется смен: {plannedCount}. Ниже — кто и когда уже стоит в
              графике. Можно перезаписать эти смены или вернуться и изменить
              назначение.
            </p>
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--paper)]/50 p-3 text-sm">
              {conflicts.map((c, i) => (
                <li
                  key={`${c.staffProfileId}-${c.dayKey}-${c.existingStartsAt}-${i}`}
                  className="border-b border-[var(--line)]/60 pb-2 last:border-b-0 last:pb-0"
                >
                  <p className="font-semibold text-[var(--ink)]">{c.staffName}</p>
                  <p className="text-[var(--ink-soft)]">
                    Сейчас: {formatConflictWhen(c.existingStartsAt, c.existingEndsAt)}
                    {c.existingPostName ? ` · ${c.existingPostName}` : ""}
                  </p>
                  <p className="text-[var(--ink-soft)]">
                    Новое: {formatConflictWhen(c.plannedStartsAt, c.plannedEndsAt)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={confirmOverwrite}
                className="min-h-11 cursor-pointer rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
              >
                {pending ? "Запись…" : "Перезаписать график"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={cancelConflicts}
                className="min-h-11 cursor-pointer rounded-md border border-[var(--line)] px-5 text-sm font-semibold"
              >
                Изменить назначение
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
