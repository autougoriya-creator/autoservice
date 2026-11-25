"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addDays,
  formatBoardDateParam,
  parseBoardDate,
  startOfLocalDay,
} from "@/lib/load-board";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function monthMatrix(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  const daysInMonth = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0,
  ).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DeskDateNav({
  dayIsoParam,
  dateLabel,
  occupiedLabel,
  busyDates,
}: {
  /** YYYY-MM-DD of the viewed day */
  dayIsoParam: string;
  dateLabel: string;
  occupiedLabel: ReactNode;
  /** Local YYYY-MM-DD keys that have bookings / open ЗН */
  busyDates: string[];
}) {
  const day = parseBoardDate(dayIsoParam);
  const prev = formatBoardDateParam(addDays(day, -1));
  const next = formatBoardDateParam(addDays(day, 1));
  const today = formatBoardDateParam(startOfLocalDay(new Date()));
  const isToday = dayIsoParam === today;

  const busySet = useMemo(() => new Set(busyDates), [busyDates]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(day.getFullYear(), day.getMonth(), 1),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  }, [dayIsoParam, day]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const cells = monthMatrix(viewMonth);
  const monthTitle = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(viewMonth);

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/owner/desk?date=${prev}`}
          className="min-h-11 rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--ink)]/30"
        >
          ← Вчера
        </Link>
        <Link
          href={`/owner/desk?date=${today}`}
          className={`inline-flex min-h-11 items-center rounded-md px-4 py-2 text-base font-bold tracking-wide ${
            isToday
              ? "bg-[var(--ink)] text-[var(--surface)] shadow-sm ring-2 ring-[var(--ink)]/30"
              : "border border-[var(--line)] bg-white/80 text-[var(--ink)] hover:border-[var(--ink)]/30"
          }`}
        >
          Сегодня
        </Link>
        <Link
          href={`/owner/desk?date=${next}`}
          className="min-h-11 rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--ink)]/30"
        >
          Завтра →
        </Link>
      </div>

      <div ref={rootRef} className="relative text-sm text-[var(--ink-soft)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--line)] bg-white/90 px-3 py-2 text-left hover:border-[var(--accent)]"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <span className="font-semibold capitalize text-[var(--ink)]">
            {dateLabel}
          </span>
          <span className="text-[var(--ink-soft)]" aria-hidden>
            ▾
          </span>
        </button>
        <span className="mx-2">·</span>
        {occupiedLabel}

        {open ? (
          <div
            role="dialog"
            aria-label="Календарь рабочего стола"
            className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-[var(--line)] bg-white p-3 shadow-[0_18px_40px_rgba(20,32,42,0.22)] sm:left-0 sm:right-auto"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="min-h-10 cursor-pointer rounded-md border border-[var(--line)] px-3 text-sm font-semibold"
                onClick={() =>
                  setViewMonth(
                    new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
                  )
                }
                aria-label="Предыдущий месяц"
              >
                ←
              </button>
              <p className="text-sm font-semibold capitalize text-[var(--ink)]">
                {monthTitle}
              </p>
              <button
                type="button"
                className="min-h-10 cursor-pointer rounded-md border border-[var(--line)] px-3 text-sm font-semibold"
                onClick={() =>
                  setViewMonth(
                    new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
                  )
                }
                aria-label="Следующий месяц"
              >
                →
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, idx) => {
                if (!cell) {
                  return <span key={`pad-${idx}`} className="min-h-11" />;
                }
                const key = formatBoardDateParam(cell);
                const selected = key === dayIsoParam;
                const isTodayCell = key === today;
                const hasBusy = busySet.has(key);
                return (
                  <Link
                    key={key}
                    href={`/owner/desk?date=${key}`}
                    onClick={() => setOpen(false)}
                    className={[
                      "relative inline-flex min-h-11 flex-col items-center justify-center rounded-lg border text-sm font-semibold transition",
                      selected
                        ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
                        : isTodayCell
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]"
                          : "border-transparent bg-[var(--paper)]/70 text-[var(--ink)] hover:border-[var(--accent)]",
                    ].join(" ")}
                    aria-current={selected ? "date" : undefined}
                  >
                    <span className="leading-none">{cell.getDate()}</span>
                    {hasBusy ? (
                      <span
                        className={`mt-0.5 h-2 w-2 rounded-full ${
                          selected
                            ? "bg-[var(--teal-soft)]"
                            : "bg-[var(--teal)]"
                        }`}
                        title="Есть записи"
                        aria-label="Есть записи"
                      />
                    ) : (
                      <span className="mt-0.5 h-2 w-2" aria-hidden />
                    )}
                  </Link>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--teal)] align-middle" />
              зелёный кружок — есть записи или ЗН
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
