import {
  formatBoardDateParam,
  parseBoardDate,
  startOfLocalDay,
} from "@/lib/load-board";

/** Плашка смены на месячной доске (сериализуемая). */
export type ScheduleShiftTile = {
  id: string;
  staffProfileId: string;
  staffName: string;
  staffTitle: string;
  postId: string;
  dayKey: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
};

export type ScheduleBoardPost = {
  id: string;
  name: string;
  workStartHour: number;
  workEndHour: number;
};

export type ScheduleBoardStaff = {
  id: string;
  name: string;
  title: string;
};

/** YYYY-MM → первый день месяца. */
export function parseMonthParam(value?: string | null) {
  if (!value) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || m < 1 || m > 12) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(y, m - 1, 1);
}

export function formatMonthParam(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Все дни месяца (локальные полуночи). */
export function daysOfMonth(monthStart: Date): Date[] {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const count = new Date(y, m + 1, 0).getDate();
  const days: Date[] = [];
  for (let d = 1; d <= count; d++) {
    days.push(new Date(y, m, d, 0, 0, 0, 0));
  }
  return days;
}

export function dayKeyOf(date: Date) {
  return formatBoardDateParam(startOfLocalDay(date));
}

export function parseDayKey(key: string) {
  return parseBoardDate(key);
}

/** Стабильный индекс цвета плашки по id сотрудника. */
export function staffColorIndex(staffProfileId: string, paletteSize: number) {
  let hash = 0;
  for (let i = 0; i < staffProfileId.length; i++) {
    hash = (hash * 31 + staffProfileId.charCodeAt(i)) >>> 0;
  }
  return hash % Math.max(1, paletteSize);
}

export const STAFF_TILE_PALETTE = [
  {
    bg: "bg-[#1a6b5c]",
    text: "text-white",
    border: "border-transparent",
  },
  {
    bg: "bg-[#c45c26]",
    text: "text-white",
    border: "border-transparent",
  },
  {
    bg: "bg-[#2c4a6e]",
    text: "text-white",
    border: "border-transparent",
  },
  {
    bg: "bg-[#8b5a2b]",
    text: "text-white",
    border: "border-transparent",
  },
  {
    bg: "bg-white",
    text: "text-[var(--ink)]",
    border: "border-[var(--ink)]/15",
  },
  {
    bg: "bg-[#f4e8c8]",
    text: "text-[#7a5a12]",
    border: "border-transparent",
  },
  {
    bg: "bg-[#4a5568]",
    text: "text-white",
    border: "border-transparent",
  },
  {
    bg: "bg-[#9a6b16]",
    text: "text-white",
    border: "border-transparent",
  },
] as const;

export function staffTileTone(staffProfileId: string) {
  const idx = staffColorIndex(staffProfileId, STAFF_TILE_PALETTE.length);
  return STAFF_TILE_PALETTE[idx];
}

export function monthBounds(monthStart: Date) {
  const start = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

export function weekdayShortRu(date: Date) {
  const labels = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  return labels[date.getDay()] ?? "";
}
