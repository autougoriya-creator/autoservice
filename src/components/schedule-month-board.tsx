"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createStaffShiftOnBoard,
  deleteStaffShiftOnBoard,
  moveStaffShiftOnBoard,
} from "@/app/actions/staff";
import { formatPostHours } from "@/lib/payroll";
import {
  addMonths,
  dayKeyOf,
  daysOfMonth,
  formatMonthParam,
  parseDayKey,
  staffTileTone,
  weekdayShortRu,
  type ScheduleBoardPost,
  type ScheduleBoardStaff,
  type ScheduleShiftTile,
} from "@/lib/schedule-board";
import { PAST_SCHEDULE_ERROR } from "@/lib/schedule-fill";

const DRAG_THRESHOLD_PX = 5;

function isPastDayKey(dayKey: string, todayKey: string) {
  return dayKey < todayKey;
}

type DragState = {
  id: string;
  originPostId: string;
  originDayKey: string;
  startClientX: number;
  startClientY: number;
};

type PendingMove = {
  next: ScheduleShiftTile;
  previous: ScheduleShiftTile;
};

type CreateDraft = {
  postId: string;
  dayKey: string;
};

function clockRange(startsAt: string, endsAt: string) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

function postNameOf(posts: ScheduleBoardPost[], postId: string) {
  return posts.find((p) => p.id === postId)?.name ?? "пост";
}

function dayLabel(dayKey: string) {
  const d = parseDayKey(dayKey);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

export function ScheduleMonthBoard({
  monthParam,
  posts,
  staff,
  initialTiles,
  canEditStaff = false,
  readOnly = false,
}: {
  /** YYYY-MM */
  monthParam: string;
  posts: ScheduleBoardPost[];
  staff: ScheduleBoardStaff[];
  initialTiles: ScheduleShiftTile[];
  /** OWNER: ссылка на карточку персонала */
  canEditStaff?: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const monthStart = useMemo(() => {
    const [y, m] = monthParam.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [monthParam]);
  const days = useMemo(() => daysOfMonth(monthStart), [monthStart]);
  const todayKey = dayKeyOf(new Date());

  const [tiles, setTiles] = useState(initialTiles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [live, setLive] = useState<{ postId: string; dayKey: string } | null>(
    null,
  );
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const didDrag = useRef(false);

  useEffect(() => {
    if (pendingMove) return;
    setTiles(initialTiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingMove только guard
  }, [initialTiles]);

  const selected = tiles.find((t) => t.id === selectedId) ?? null;

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric",
      }).format(monthStart),
    [monthStart],
  );

  const prevMonth = formatMonthParam(addMonths(monthStart, -1));
  const nextMonth = formatMonthParam(addMonths(monthStart, 1));
  const thisMonth = formatMonthParam(new Date());

  const persistMove = useCallback(
    async (next: ScheduleShiftTile, previous: ScheduleShiftTile) => {
      const result = await moveStaffShiftOnBoard({
        id: next.id,
        postId: next.postId,
        dayKey: next.dayKey,
      });
      if (!result.ok) {
        setTiles((prev) =>
          prev.map((t) => (t.id === previous.id ? previous : t)),
        );
        setError(result.error);
        return;
      }
      setError(null);
      startTransition(() => router.refresh());
    },
    [router],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!drag) return;
      const movedPx = Math.hypot(
        e.clientX - drag.startClientX,
        e.clientY - drag.startClientY,
      );
      if (!didDrag.current && movedPx < DRAG_THRESHOLD_PX) return;
      didDrag.current = true;
      e.preventDefault();

      const entries = Object.entries(cellRefs.current).filter(
        ([, el]) => el != null,
      ) as [string, HTMLDivElement][];
      let targetPost = live?.postId ?? drag.originPostId;
      let targetDay = live?.dayKey ?? drag.originDayKey;
      for (const [key, el] of entries) {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          const [postId, dayKey] = key.split("::");
          // В прошлое не переносим — оставляем последний допустимый target.
          if (!isPastDayKey(dayKey, todayKey)) {
            targetPost = postId;
            targetDay = dayKey;
          }
          break;
        }
      }
      setLive({ postId: targetPost, dayKey: targetDay });
    },
    [drag, live, todayKey],
  );

  const onPointerUp = useCallback(() => {
    if (!drag || !live || !didDrag.current) {
      setDrag(null);
      setLive(null);
      return;
    }
    const tile =
      tiles.find((t) => t.id === drag.id) ??
      initialTiles.find((t) => t.id === drag.id);
    if (!tile) {
      setDrag(null);
      setLive(null);
      return;
    }
    const previous: ScheduleShiftTile = {
      ...tile,
      postId: drag.originPostId,
      dayKey: drag.originDayKey,
    };
    const next: ScheduleShiftTile = {
      ...tile,
      postId: live.postId,
      dayKey: live.dayKey,
    };
    const changed =
      previous.postId !== next.postId || previous.dayKey !== next.dayKey;

    setDrag(null);
    setLive(null);
    if (!changed) return;
    if (
      isPastDayKey(previous.dayKey, todayKey) ||
      isPastDayKey(next.dayKey, todayKey)
    ) {
      setError(PAST_SCHEDULE_ERROR);
      return;
    }

    setTiles((prev) => prev.map((t) => (t.id === next.id ? next : t)));
    setPendingMove({ next, previous });
  }, [drag, initialTiles, live, tiles, todayKey]);

  function confirmPendingMove() {
    if (!pendingMove) return;
    const { next, previous } = pendingMove;
    setPendingMove(null);
    void persistMove(next, previous);
  }

  function rejectPendingMove() {
    if (!pendingMove) return;
    const { previous } = pendingMove;
    setTiles((prev) =>
      prev.map((t) => (t.id === previous.id ? previous : t)),
    );
    setPendingMove(null);
    setError(null);
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => onPointerMove(e);
    const up = () => onPointerUp();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, onPointerMove, onPointerUp]);

  function beginDrag(e: ReactPointerEvent, tile: ScheduleShiftTile) {
    if (readOnly || pendingMove) return;
    if (isPastDayKey(tile.dayKey, todayKey)) return;
    e.stopPropagation();
    didDrag.current = false;
    setCreateDraft(null);
    setDrag({
      id: tile.id,
      originPostId: tile.postId,
      originDayKey: tile.dayKey,
      startClientX: e.clientX,
      startClientY: e.clientY,
    });
    setLive({ postId: tile.postId, dayKey: tile.dayKey });
  }

  function onCellClick(postId: string, dayKey: string) {
    if (readOnly || pendingMove) return;
    if (isPastDayKey(dayKey, todayKey)) return;
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    setSelectedId(null);
    setCreateDraft({ postId, dayKey });
  }

  const displayTiles = tiles.map((t) => {
    if (drag && live && t.id === drag.id) {
      return { ...t, postId: live.postId, dayKey: live.dayKey };
    }
    return t;
  });

  const colTemplate = `minmax(140px, 168px) repeat(${days.length}, minmax(72px, 1fr))`;

  return (
    <div className="space-y-4" id="schedule-month-board">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/owner/schedule?month=${prevMonth}`}
            className="min-h-11 rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--ink)]/30"
          >
            ← Пред. месяц
          </Link>
          <Link
            href={`/owner/schedule?month=${thisMonth}`}
            className={`inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-bold tracking-wide ${
              monthParam === thisMonth
                ? "bg-[var(--ink)] text-white shadow-sm ring-2 ring-[var(--ink)]/30"
                : "border border-[var(--line)] bg-white/80 text-[var(--ink)] hover:border-[var(--ink)]/30"
            }`}
          >
            Этот месяц
          </Link>
          <Link
            href={`/owner/schedule?month=${nextMonth}`}
            className="min-h-11 rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--ink)]/30"
          >
            След. месяц →
          </Link>
        </div>
        <p className="text-sm capitalize text-[var(--ink-soft)]">
          <span className="font-semibold text-[var(--ink)]">{monthTitle}</span>
          {" · "}
          {readOnly
            ? "только просмотр · двойной клик — карточка"
            : "с сегодня — перетаскивание и назначение · прошлые дни только просмотр · двойной клик — карточка"}
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
          <button
            type="button"
            className="ml-3 font-semibold underline"
            onClick={() => setError(null)}
          >
            Закрыть
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white/90 shadow-[var(--shadow)] touch-pan-x">
        <div style={{ minWidth: Math.max(720, 168 + days.length * 76) }}>
          <div
            className="grid border-b border-[var(--line)] bg-[var(--paper)]/90"
            style={{ gridTemplateColumns: colTemplate }}
          >
            <div className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
              Пост
              <span className="mt-0.5 block font-normal normal-case tracking-normal text-[10px]">
                × дни месяца
              </span>
            </div>
            {days.map((day) => {
              const key = dayKeyOf(day);
              const isToday = key === todayKey;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={key}
                  className={`border-l border-[var(--line)] px-1 py-2 text-center ${
                    isToday
                      ? "bg-[var(--accent)]/10"
                      : isWeekend
                        ? "bg-[var(--ink)]/[0.03]"
                        : ""
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                    {weekdayShortRu(day)}
                  </p>
                  <p
                    className={`text-sm font-bold ${
                      isToday ? "text-[var(--accent)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {day.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {posts.map((post) => (
            <div
              key={post.id}
              className="grid border-b border-[var(--line)] last:border-b-0"
              style={{ gridTemplateColumns: colTemplate }}
            >
              <div className="flex flex-col justify-center gap-1 border-r border-[var(--line)] bg-[var(--paper)]/40 px-3 py-3">
                <p className="font-semibold text-[var(--ink)]">{post.name}</p>
                <p className="text-xs font-medium text-[var(--teal)]">
                  {formatPostHours(post.workStartHour, post.workEndHour)}
                </p>
              </div>
              {days.map((day) => {
                const dayKey = dayKeyOf(day);
                const cellKey = `${post.id}::${dayKey}`;
                const cellTiles = displayTiles.filter(
                  (t) => t.postId === post.id && t.dayKey === dayKey,
                );
                const isToday = dayKey === todayKey;
                const isPast = isPastDayKey(dayKey, todayKey);
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const cellLocked = readOnly || isPast;
                return (
                  <div
                    key={cellKey}
                    ref={(el) => {
                      cellRefs.current[cellKey] = el;
                    }}
                    onClick={() => onCellClick(post.id, dayKey)}
                    title={isPast ? PAST_SCHEDULE_ERROR : undefined}
                    className={`relative min-h-[88px] border-l border-[var(--line)]/70 p-1 ${
                      cellLocked ? "cursor-default" : "cursor-cell"
                    } ${
                      isPast
                        ? "bg-[var(--ink)]/[0.05] opacity-70"
                        : isToday
                          ? "bg-[var(--accent)]/[0.06]"
                          : isWeekend
                            ? "bg-[var(--ink)]/[0.02]"
                            : "bg-[var(--paper)]/20"
                    } ${
                      live &&
                      drag &&
                      live.postId === post.id &&
                      live.dayKey === dayKey
                        ? "ring-2 ring-inset ring-[var(--accent)]/50"
                        : ""
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      {cellTiles.map((tile) => {
                        const tone = staffTileTone(tile.staffProfileId);
                        const active = selectedId === tile.id;
                        const tileLocked = cellLocked;
                        return (
                          <div
                            key={tile.id}
                            role="button"
                            tabIndex={0}
                            title={
                              tileLocked
                                ? isPast
                                  ? PAST_SCHEDULE_ERROR
                                  : "Двойной клик — карточка"
                                : "Двойной клик — карточка · перетащите, чтобы перенести"
                            }
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (pendingMove) return;
                              if (didDrag.current) {
                                didDrag.current = false;
                                return;
                              }
                              setCreateDraft(null);
                              setSelectedId(tile.id);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (didDrag.current) didDrag.current = false;
                            }}
                            onPointerDown={(e) => beginDrag(e, tile)}
                            className={`rounded-md border px-1.5 py-1 text-[11px] leading-tight shadow-sm ${
                              tileLocked ? "" : "touch-none"
                            } ${tone.bg} ${tone.text} ${tone.border} ${
                              active
                                ? "ring-2 ring-[var(--accent)] ring-offset-1"
                                : ""
                            } ${
                              drag?.id === tile.id ? "opacity-90 z-10" : ""
                            } ${
                              tileLocked
                                ? "cursor-pointer"
                                : "cursor-grab active:cursor-grabbing"
                            }`}
                          >
                            <p className="truncate font-semibold">
                              {tile.staffName}
                            </p>
                            <p className="mt-0.5 truncate text-[9px] opacity-80">
                              {clockRange(tile.startsAt, tile.endsAt)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {posts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--ink-soft)]">
              Нет активных постов — добавьте их в разделе «Посты».
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-[var(--ink-soft)]">
        Каждая плашка — сотрудник на смене. Цвет закреплён за человеком.
        Прошедшие дни нельзя менять. Администраторы (смены без поста) в этой
        сетке не показываются.
      </p>

      {pendingMove ? (
        <MoveConfirmDialog
          previous={pendingMove.previous}
          next={pendingMove.next}
          posts={posts}
          onConfirm={confirmPendingMove}
          onReject={rejectPendingMove}
        />
      ) : null}

      {selected ? (
        <TileDetailPanel
          tile={selected}
          posts={posts}
          canEditStaff={canEditStaff}
          readOnly={readOnly || isPastDayKey(selected.dayKey, todayKey)}
          todayKey={todayKey}
          onClose={() => setSelectedId(null)}
          onMoved={(next) => {
            setTiles((prev) =>
              prev.map((t) => (t.id === next.id ? next : t)),
            );
            setSelectedId(null);
            startTransition(() => router.refresh());
          }}
          onRemoved={(id) => {
            setTiles((prev) => prev.filter((t) => t.id !== id));
            setSelectedId(null);
            startTransition(() => router.refresh());
          }}
          onError={setError}
        />
      ) : null}

      {!readOnly && createDraft && posts.length > 0 ? (
        <CreateTilePanel
          draft={createDraft}
          posts={posts}
          staff={staff}
          onClose={() => setCreateDraft(null)}
          onCreated={(tile) => {
            setTiles((prev) => [...prev, tile]);
            setCreateDraft(null);
            setSelectedId(tile.id);
            startTransition(() => router.refresh());
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function MoveConfirmDialog({
  previous,
  next,
  posts,
  onConfirm,
  onReject,
}: {
  previous: ScheduleShiftTile;
  next: ScheduleShiftTile;
  posts: ScheduleBoardPost[];
  onConfirm: () => void;
  onReject: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onReject();
      if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onReject]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--ink)]/45 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-move-title"
      onClick={onReject}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_24px_60px_rgba(20,32,42,0.28)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          Перенос на графике
        </p>
        <h2
          id="schedule-move-title"
          className="brand-mark mt-1 text-2xl text-[var(--ink)]"
        >
          Перенести смену?
        </h2>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          {previous.staffName}
          {previous.staffTitle ? ` · ${previous.staffTitle}` : ""}
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-[var(--ink-soft)]">Было</dt>
            <dd className="font-medium text-[var(--ink)]">
              {dayLabel(previous.dayKey)} · {postNameOf(posts, previous.postId)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-soft)]">Станет</dt>
            <dd className="font-semibold text-[var(--ink)]">
              {dayLabel(next.dayKey)} · {postNameOf(posts, next.postId)}
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 cursor-pointer rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-deep)]"
          >
            Да
          </button>
          <button
            type="button"
            onClick={onReject}
            className="min-h-11 cursor-pointer rounded-md border border-[var(--line)] px-5 text-sm font-semibold"
          >
            Нет
          </button>
        </div>
      </div>
    </div>
  );
}

function TileDetailPanel({
  tile,
  posts,
  canEditStaff,
  readOnly,
  todayKey,
  onClose,
  onMoved,
  onRemoved,
  onError,
}: {
  tile: ScheduleShiftTile;
  posts: ScheduleBoardPost[];
  canEditStaff: boolean;
  readOnly: boolean;
  todayKey: string;
  onClose: () => void;
  onMoved: (tile: ScheduleShiftTile) => void;
  onRemoved: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [postId, setPostId] = useState(tile.postId);
  const [dayKey, setDayKey] = useState(tile.dayKey);
  const [pending, setPending] = useState(false);
  const isPast = isPastDayKey(tile.dayKey, todayKey);

  useEffect(() => {
    setPostId(tile.postId);
    setDayKey(tile.dayKey);
  }, [tile]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (isPastDayKey(dayKey, todayKey)) {
      onError(PAST_SCHEDULE_ERROR);
      return;
    }
    setPending(true);
    const result = await moveStaffShiftOnBoard({
      id: tile.id,
      postId,
      dayKey,
    });
    setPending(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onMoved({ ...tile, postId, dayKey });
  }

  async function remove() {
    if (isPast) {
      onError(PAST_SCHEDULE_ERROR);
      return;
    }
    setPending(true);
    const result = await deleteStaffShiftOnBoard({ id: tile.id });
    setPending(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onRemoved(tile.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/45 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-tile-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_24px_60px_rgba(20,32,42,0.28)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Смена
            </p>
            <h2
              id="schedule-tile-title"
              className="brand-mark mt-1 text-2xl text-[var(--ink)]"
            >
              {tile.staffName}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {tile.staffTitle}
              {tile.note ? ` · ${tile.note}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 cursor-pointer rounded-md border border-[var(--line)] px-4 text-sm font-semibold"
          >
            Закрыть
          </button>
        </div>

        <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--ink-soft)]">Пост</dt>
            <dd className="font-medium">
              {posts.find((p) => p.id === tile.postId)?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-soft)]">День</dt>
            <dd className="font-medium">{dayLabel(tile.dayKey)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--ink-soft)]">Часы</dt>
            <dd className="font-medium">
              {clockRange(tile.startsAt, tile.endsAt)}
            </dd>
          </div>
        </dl>

        {readOnly ? (
          <p className="text-xs text-[var(--ink-soft)]">
            {isPast ? PAST_SCHEDULE_ERROR : "Редактирование недоступно"}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold">Пост</span>
              <select
                value={postId}
                onChange={(e) => setPostId(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
              >
                {posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold">День</span>
              <input
                type="date"
                value={dayKey}
                min={todayKey}
                onChange={(e) => setDayKey(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
              />
            </label>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {!readOnly ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => void save()}
                className="min-h-11 cursor-pointer rounded-md bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Сохранение…" : "Сохранить"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void remove()}
                className="min-h-11 cursor-pointer rounded-md border border-[var(--line)] px-5 text-sm font-semibold text-[var(--accent-deep)]"
              >
                Удалить смену
              </button>
            </>
          ) : null}
          {canEditStaff ? (
            <Link
              href={`/owner/staff/${tile.staffProfileId}`}
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-5 text-sm font-semibold"
            >
              Карточка сотрудника
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CreateTilePanel({
  draft,
  posts,
  staff,
  onClose,
  onCreated,
  onError,
}: {
  draft: CreateDraft;
  posts: ScheduleBoardPost[];
  staff: ScheduleBoardStaff[];
  onClose: () => void;
  onCreated: (tile: ScheduleShiftTile) => void;
  onError: (msg: string) => void;
}) {
  const [staffProfileId, setStaffProfileId] = useState(staff[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const postName = posts.find((p) => p.id === draft.postId)?.name ?? "пост";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!staffProfileId) {
      onError("Выберите сотрудника");
      return;
    }
    setPending(true);
    const result = await createStaffShiftOnBoard({
      staffProfileId,
      postId: draft.postId,
      dayKey: draft.dayKey,
    });
    setPending(false);
    if (!result.ok || !result.id) {
      onError(result.ok ? "Не удалось создать" : result.error);
      return;
    }
    const person = staff.find((s) => s.id === staffProfileId);
    const post = posts.find((p) => p.id === draft.postId);
    const day = parseDayKey(draft.dayKey);
    const startH = post?.workStartHour ?? 9;
    const endH = post?.workEndHour ?? 18;
    const startsAt = new Date(day);
    startsAt.setHours(startH, 0, 0, 0);
    const endsAt = new Date(day);
    endsAt.setHours(endH, 0, 0, 0);
    onCreated({
      id: result.id,
      staffProfileId,
      staffName: person?.name ?? "Сотрудник",
      staffTitle: person?.title ?? "",
      postId: draft.postId,
      dayKey: draft.dayKey,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      note: null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/45 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-create-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_24px_60px_rgba(20,32,42,0.28)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Назначить на смену
            </p>
            <h2
              id="schedule-create-title"
              className="brand-mark mt-1 text-2xl text-[var(--ink)]"
            >
              {postName}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {dayLabel(draft.dayKey)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 cursor-pointer rounded-md border border-[var(--line)] px-4 text-sm font-semibold"
          >
            Отмена
          </button>
        </div>

        {staff.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            Нет активных мойщиков/слесарей
          </p>
        ) : (
          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold">Сотрудник</span>
            <select
              value={staffProfileId}
              onChange={(e) => setStaffProfileId(e.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending || staff.length === 0}
            onClick={() => void submit()}
            className="min-h-11 cursor-pointer rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Создание…" : "Поставить на смену"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 cursor-pointer rounded-md border border-[var(--line)] px-5 text-sm font-semibold"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
