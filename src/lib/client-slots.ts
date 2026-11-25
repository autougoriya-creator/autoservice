import {
  BOARD_END_HOUR,
  BOARD_SNAP_MIN,
  BOARD_START_HOUR,
} from "@/lib/load-board";

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

function formatSlotLabel(d: Date) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month} · ${hh}:${mm}`;
}

/**
 * Build free time slots for client self-booking.
 * Picks the first post that is free for each candidate start.
 */
export function buildClientSlots(params: {
  posts: { id: string }[];
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

  const duration = Math.max(
    BOARD_SNAP_MIN,
    Math.round(durationMin / BOARD_SNAP_MIN) * BOARD_SNAP_MIN,
  );
  const now = from.getTime();
  const slots: SlotOption[] = [];
  const day0 = startOfLocalDay(from);

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = new Date(day0);
    day.setDate(day0.getDate() + dayOffset);

    const dayStartMin = BOARD_START_HOUR * 60;
    const dayEndMin = BOARD_END_HOUR * 60;

    for (
      let minuteOfDay = dayStartMin;
      minuteOfDay + duration <= dayEndMin;
      minuteOfDay += BOARD_SNAP_MIN
    ) {
      const startsAt = new Date(day);
      startsAt.setHours(0, 0, 0, 0);
      startsAt.setMinutes(minuteOfDay);

      if (startsAt.getTime() < now + 5 * 60 * 1000) continue;

      const endsAt = startsAt.getTime() + duration * 60_000;

      const freePost = posts.find((post) => {
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

      if (!freePost) continue;

      slots.push({
        startsAtIso: startsAt.toISOString(),
        label: formatSlotLabel(startsAt),
        postId: freePost.id,
      });
    }
  }

  return slots;
}
