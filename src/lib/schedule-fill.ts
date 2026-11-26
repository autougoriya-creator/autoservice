/** Режимы дней для массового заполнения смен. */
export type WeekdayMode = "all" | "weekdays" | "weekends" | "custom";

/** Пн=1 … Вс=7 (как в UI). */
export const WEEKDAY_LABELS: { value: number; label: string; short: string }[] =
  [
    { value: 1, label: "Понедельник", short: "Пн" },
    { value: 2, label: "Вторник", short: "Вт" },
    { value: 3, label: "Среда", short: "Ср" },
    { value: 4, label: "Четверг", short: "Чт" },
    { value: 5, label: "Пятница", short: "Пт" },
    { value: 6, label: "Суббота", short: "Сб" },
    { value: 7, label: "Воскресенье", short: "Вс" },
  ];

/** JS getDay() (0=вс) → 1…7 (пн…вс). */
export function isoWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export function resolveWeekdays(
  mode: WeekdayMode,
  custom: number[] = [],
): Set<number> {
  if (mode === "all") return new Set([1, 2, 3, 4, 5, 6, 7]);
  if (mode === "weekdays") return new Set([1, 2, 3, 4, 5]);
  if (mode === "weekends") return new Set([6, 7]);
  const cleaned = custom.filter((n) => n >= 1 && n <= 7);
  return new Set(cleaned);
}

export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

export function toDateInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Локальная полуночь «сегодня» (сервер/браузер в своей TZ). */
export function startOfTodayLocal(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** День раньше локального «сегодня» — правки графика запрещены. */
export function isBeforeTodayLocal(date: Date, now = new Date()) {
  return startOfLocalDay(date).getTime() < startOfTodayLocal(now).getTime();
}

export const PAST_SCHEDULE_ERROR =
  "Нельзя менять график за прошедшие дни — только с сегодняшнего";

/** Окно смены в локальном времени по часам поста. */
export function shiftWindowForDay(
  day: Date,
  workStartHour: number,
  workEndHour: number,
) {
  const startsAt = new Date(day);
  startsAt.setHours(workStartHour, 0, 0, 0);
  const endsAt = new Date(day);
  endsAt.setHours(workEndHour, 0, 0, 0);
  return { startsAt, endsAt };
}

export function enumerateMatchingDays(
  from: Date,
  to: Date,
  weekdays: Set<number>,
): Date[] {
  const days: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(to);
  last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    if (weekdays.has(isoWeekday(cursor))) {
      days.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function daysBetweenInclusive(from: Date, to: Date) {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Пересечение двух интервалов [start, end). */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
) {
  return aStart < bEnd && bStart < aEnd;
}

export const MAX_BULK_PERIOD_DAYS = 92;
