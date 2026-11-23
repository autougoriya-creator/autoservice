export const BOARD_START_HOUR = 8;
export const BOARD_END_HOUR = 20;
export const BOARD_HOURS = Array.from(
  { length: BOARD_END_HOUR - BOARD_START_HOUR },
  (_, i) => BOARD_START_HOUR + i,
);

export type BoardBlock = {
  id: string;
  kind: "booking" | "work_order";
  postId: string;
  title: string;
  subtitle: string;
  startsAt: Date;
  durationMin: number;
  status: string;
  href: string;
};

export function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function parseBoardDate(value?: string | null) {
  if (!value) return startOfLocalDay(new Date());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return startOfLocalDay(new Date());
  const d = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    0,
    0,
    0,
    0,
  );
  return Number.isNaN(d.getTime()) ? startOfLocalDay(new Date()) : d;
}

export function formatBoardDateParam(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfLocalDay(d);
}

export function atHour(day: Date, hour: number, minute = 0) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Position a block inside the day board as % of the working window. */
export function blockLayout(startsAt: Date, durationMin: number) {
  const dayStart = new Date(startsAt);
  dayStart.setHours(BOARD_START_HOUR, 0, 0, 0);
  const windowMin = (BOARD_END_HOUR - BOARD_START_HOUR) * 60;
  const offsetMin =
    (startsAt.getTime() - dayStart.getTime()) / (60 * 1000);
  const left = Math.max(0, Math.min(100, (offsetMin / windowMin) * 100));
  const width = Math.max(
    2.5,
    Math.min(100 - left, (durationMin / windowMin) * 100),
  );
  return { leftPct: left, widthPct: width };
}

export function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
