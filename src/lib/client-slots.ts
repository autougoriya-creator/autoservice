import { BOARD_SNAP_MIN } from "@/lib/load-board";

export type BusyInterval = {
  startsAt: Date;
  durationMin: number;
  postId: string;
};

export type SlotOption = {
  /** ISO start time */
  startsAtIso: string;
  /** Display label, e.g. «25.11 · 10:00» */
  label: string;
  postId: string;
};

export type DaySlot = {
  startsAtIso: string;
  /** «10:00» */
  timeLabel: string;
  postId: string | null;
  available: boolean;
};

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  return aStart < bEnd && bStart < aEnd;
}

/** Local calendar day key YYYY-MM-DD */
export function localDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatSlotLabel(d: Date) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month} · ${hh}:${mm}`;
}

export function formatTimeLabel(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function snapDurationMin(durationMin: number) {
  return Math.max(
    BOARD_SNAP_MIN,
    Math.round(durationMin / BOARD_SNAP_MIN) * BOARD_SNAP_MIN,
  );
}

/** Calendar day keys for the booking horizon (default 14 days). */
export function bookingDayKeys(from = new Date(), days = 14): string[] {
  const day0 = startOfLocalDay(from);
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(day0);
    day.setDate(day0.getDate() + i);
    keys.push(localDayKey(day));
  }
  return keys;
}

/**
 * All candidate starts for one local day: free + busy.
 * Busy slots keep `available: false` and `postId: null`.
 */
export function buildDaySlots(params: {
  dayKey: string;
  posts: { id: string; workStartHour?: number; workEndHour?: number }[];
  busy: BusyInterval[];
  durationMin: number;
  from?: Date;
}): DaySlot[] {
  const { dayKey, posts, busy, durationMin, from = new Date() } = params;
  const day = parseLocalDayKey(dayKey);
  if (!day || posts.length === 0) return [];

  const duration = snapDurationMin(durationMin);
  const now = from.getTime();
  const earliestStart = Math.min(...posts.map((p) => p.workStartHour ?? 8));
  const latestEnd = Math.max(...posts.map((p) => p.workEndHour ?? 20));
  const slots: DaySlot[] = [];

  for (
    let minuteOfDay = earliestStart * 60;
    minuteOfDay + duration <= latestEnd * 60;
    minuteOfDay += BOARD_SNAP_MIN
  ) {
    const startsAt = new Date(day);
    startsAt.setHours(0, 0, 0, 0);
    startsAt.setMinutes(minuteOfDay);
    const endsAt = startsAt.getTime() + duration * 60_000;
    const endMinuteOfDay = minuteOfDay + duration;
    const past = startsAt.getTime() < now + 5 * 60 * 1000;

    const freePost = past
      ? undefined
      : posts.find((post) => {
          const startH = (post.workStartHour ?? 8) * 60;
          const endH = (post.workEndHour ?? 20) * 60;
          if (minuteOfDay < startH || endMinuteOfDay > endH) return false;
          const postBusy = busy.filter((b) => b.postId === post.id);
          return !postBusy.some((b) =>
            overlaps(
              startsAt.getTime(),
              endsAt,
              b.startsAt.getTime(),
              b.startsAt.getTime() + b.durationMin * 60_000,
            ),
          );
        });

    const withinAnyPost = posts.some((post) => {
      const startH = (post.workStartHour ?? 8) * 60;
      const endH = (post.workEndHour ?? 20) * 60;
      return minuteOfDay >= startH && endMinuteOfDay <= endH;
    });
    if (!withinAnyPost) continue;

    slots.push({
      startsAtIso: startsAt.toISOString(),
      timeLabel: formatTimeLabel(startsAt),
      postId: freePost?.id ?? null,
      available: Boolean(freePost),
    });
  }

  return slots;
}

/**
 * Build free time slots for client self-booking.
 * Picks the first post that is free for each candidate start,
 * respecting that post's own working hours.
 */
export function buildClientSlots(params: {
  posts: { id: string; workStartHour?: number; workEndHour?: number }[];
  busy: BusyInterval[];
  durationMin: number;
  from?: Date;
  days?: number;
}): SlotOption[] {
  const {
    posts,
    busy,
    durationMin,
    from = new Date(),
    days = 7,
  } = params;

  if (posts.length === 0) return [];

  const slots: SlotOption[] = [];
  for (const dayKey of bookingDayKeys(from, days)) {
    for (const slot of buildDaySlots({
      dayKey,
      posts,
      busy,
      durationMin,
      from,
    })) {
      if (!slot.available || !slot.postId) continue;
      slots.push({
        startsAtIso: slot.startsAtIso,
        label: formatSlotLabel(new Date(slot.startsAtIso)),
        postId: slot.postId,
      });
    }
  }

  return slots;
}
