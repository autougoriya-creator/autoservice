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
import { useRouter } from "next/navigation";
import {
  BOARD_HOURS,
  BOARD_START_HOUR,
  BOARD_END_HOUR,
  BOARD_SNAP_MIN,
  BOARD_WINDOW_MIN,
  clampBoardMinutes,
  dateFromDayOffset,
  offsetFromPct,
  offsetMinutesFromDate,
  pctFromOffset,
  snapMinutes,
  type DeskBlock,
} from "@/lib/load-board";
import {
  cancelDeskBooking,
  createDeskBooking,
  createWorkOrderFromBooking,
  moveDeskItem,
  updateDeskBooking,
  updateDeskWorkOrder,
} from "@/app/actions/desk";
import { selectableBookingStatuses } from "@/lib/booking";
import {
  bookingStatusLabel,
  formatRub,
  workOrderStatusLabel,
} from "@/lib/format";
import { phoneDigits } from "@/lib/phone";
import { selectableWorkOrderStatuses } from "@/lib/work-order";
import type { BookingStatus, WorkOrderStatus } from "@prisma/client";

type Post = {
  id: string;
  name: string;
  workStartHour?: number;
  workEndHour?: number;
};
type VehicleOpt = {
  id: string;
  make: string;
  model: string;
  plate: string;
};
type CustomerOpt = {
  id: string;
  name: string;
  phone: string;
  vehicles: VehicleOpt[];
};
type ServiceOpt = {
  id: string;
  name: string;
  durationMin: number;
  priceRub: number;
};

function vehicleLabel(v: VehicleOpt) {
  return `${v.make} ${v.model} · ${v.plate}`;
}

/** Поиск клиента по цифрам телефона (от 3 знаков). */
function customersByPhoneQuery(
  customers: CustomerOpt[],
  query: string,
): CustomerOpt[] {
  const q = phoneDigits(query);
  if (q.length < 3) return [];
  return customers.filter((c) => {
    const digits = phoneDigits(c.phone);
    return digits.includes(q) || q.includes(digits);
  });
}

type DragState = {
  id: string;
  mode: "move" | "resize";
  originPostId: string;
  originOffset: number;
  originDuration: number;
  grabOffsetMin: number;
  /** Пиксели pointerdown — порог, чтобы микросдвиг не глушил dblclick. */
  startClientX: number;
  startClientY: number;
};

/** Сдвиг указателя, после которого жест считается перетаскиванием, а не кликом. */
const DRAG_THRESHOLD_PX = 5;

type CreateDraft = {
  postId: string;
  offsetMin: number;
};

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Цвета плашек ЗН — отдельно от записи (cream/gold/white). */
const WORK_ORDER_STATUS_SWATCH: Record<string, string> = {
  IN_PROGRESS: "bg-[var(--accent)]",
  CLOSED: "bg-[var(--teal)]",
};

function workOrderBlockTone(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-[var(--accent)] text-white border-transparent";
    case "CLOSED":
      return "bg-[var(--teal)]/90 text-white border-transparent";
    default:
      return "bg-[var(--accent)] text-white border-transparent";
  }
}

function blockTone(kind: DeskBlock["kind"], status: string) {
  if (kind === "work_order") return workOrderBlockTone(status);
  if (status === "NEW_FROM_CLIENT")
    return "bg-[#9a6b16] text-white border-transparent";
  if (status === "CONFIRMED")
    return "bg-white text-[var(--ink)] border-[var(--ink)]/15 shadow-sm";
  // NEW
  return "bg-[#f4e8c8] text-[#7a5a12] border-transparent";
}

function statusText(kind: DeskBlock["kind"], status: string) {
  return kind === "work_order"
    ? (workOrderStatusLabel[status] ?? status)
    : (bookingStatusLabel[status] ?? status);
}

function formatClock(dateIso: string) {
  const d = new Date(dateIso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function localInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function InteractiveDesk({
  dayIso,
  posts,
  initialBlocks,
  customers,
  services,
  readOnly = false,
  showFinance = false,
}: {
  dayIso: string;
  posts: Post[];
  initialBlocks: DeskBlock[];
  customers: CustomerOpt[];
  services: ServiceOpt[];
  /** STAFF: view assigned posts only — no DnD / resize / create */
  readOnly?: boolean;
  /** OWNER: show planned amounts on cards / details */
  showFinance?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const day = useMemo(() => new Date(dayIso), [dayIso]);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [live, setLive] = useState<{
    postId: string;
    offsetMin: number;
    durationMin: number;
  } | null>(null);
  const trackRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const didDrag = useRef(false);

  useEffect(() => {
    setBlocks(initialBlocks);
  }, [initialBlocks]);

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const persistMove = useCallback(
    async (
      block: DeskBlock,
      postId: string,
      offsetMin: number,
      durationMin: number,
      previous: DeskBlock,
    ) => {
      const startsAt = dateFromDayOffset(day, offsetMin);
      const result = await moveDeskItem({
        kind: block.kind,
        id: block.id,
        postId,
        startsAtIso: startsAt.toISOString(),
        durationMin: block.kind === "booking" ? durationMin : undefined,
      });
      if (!result.ok) {
        setBlocks((prev) =>
          prev.map((b) => (b.id === previous.id ? previous : b)),
        );
        setError(result.error);
        return;
      }
      setError(null);
      startTransition(() => router.refresh());
    },
    [day, router],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!drag) return;
      const movedPx = Math.hypot(
        e.clientX - drag.startClientX,
        e.clientY - drag.startClientY,
      );
      if (!didDrag.current && movedPx < DRAG_THRESHOLD_PX) {
        return;
      }
      didDrag.current = true;
      e.preventDefault();

      const entries = Object.entries(trackRefs.current).filter(
        ([, el]) => el != null,
      ) as [string, HTMLDivElement][];
      let targetPost = drag.originPostId;
      let targetTrack = trackRefs.current[drag.originPostId];
      for (const [postId, el] of entries) {
        const rect = el.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          targetPost = postId;
          targetTrack = el;
          break;
        }
      }
      if (!targetTrack) return;
      const rect = targetTrack.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const rawOffset = offsetFromPct(pct);

      if (drag.mode === "move") {
        const nextOffset = clampBoardMinutes(
          rawOffset - drag.grabOffsetMin,
          drag.originDuration,
        );
        setLive({
          postId: targetPost,
          offsetMin: nextOffset,
          durationMin: drag.originDuration,
        });
      } else {
        const start = drag.originOffset;
        const maxDur = BOARD_WINDOW_MIN - start;
        const duration = Math.min(
          maxDur,
          Math.max(BOARD_SNAP_MIN, snapMinutes(rawOffset - start)),
        );
        setLive({
          postId: drag.originPostId,
          offsetMin: start,
          durationMin: duration,
        });
      }
    },
    [drag],
  );

  const onPointerUp = useCallback(() => {
    if (!drag || !live || !didDrag.current) {
      setDrag(null);
      setLive(null);
      return;
    }
    const block = blocks.find((b) => b.id === drag.id);
    if (!block) {
      setDrag(null);
      setLive(null);
      return;
    }
    const previous = { ...block };
    const nextStarts = dateFromDayOffset(day, live.offsetMin);
    const next: DeskBlock = {
      ...block,
      postId: live.postId,
      startsAt: nextStarts.toISOString(),
      durationMin: live.durationMin,
    };
    const changed =
      previous.postId !== next.postId ||
      previous.startsAt !== next.startsAt ||
      previous.durationMin !== next.durationMin;

    setBlocks((prev) => prev.map((b) => (b.id === next.id ? next : b)));
    setDrag(null);
    setLive(null);

    if (changed) {
      void persistMove(
        next,
        next.postId,
        live.offsetMin,
        live.durationMin,
        previous,
      );
    }
  }, [blocks, day, drag, live, persistMove]);

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

  function beginDrag(
    e: ReactPointerEvent,
    block: DeskBlock,
    mode: "move" | "resize",
  ) {
    if (readOnly) return;
    // Не preventDefault на pointerdown — иначе браузер глушит dblclick.
    // Для touch достаточно CSS touch-none на плашке.
    e.stopPropagation();
    didDrag.current = false;
    const track = trackRefs.current[block.postId];
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const pointerOffset = offsetFromPct(pct);
    const originOffset = clampBoardMinutes(
      offsetMinutesFromDate(new Date(block.startsAt)),
      block.durationMin,
    );
    // Не открываем карточку на pointerdown — иначе модалка всплывает при любом drag.
    setCreateDraft(null);
    setDrag({
      id: block.id,
      mode,
      originPostId: block.postId,
      originOffset,
      originDuration: block.durationMin,
      grabOffsetMin: pointerOffset - originOffset,
      startClientX: e.clientX,
      startClientY: e.clientY,
    });
    setLive({
      postId: block.postId,
      offsetMin: originOffset,
      durationMin: block.durationMin,
    });
  }

  function onTrackClick(postId: string, e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return;
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const offsetMin = clampBoardMinutes(offsetFromPct(pct), 60);
    setSelectedId(null);
    setCreateDraft({ postId, offsetMin });
  }

  const displayBlocks = blocks.map((b) => {
    if (drag && live && b.id === drag.id) {
      return {
        ...b,
        postId: live.postId,
        startsAt: dateFromDayOffset(day, live.offsetMin).toISOString(),
        durationMin: live.durationMin,
      };
    }
    return b;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]">
          {readOnly
            ? "Только просмотр закреплённых постов · двойной клик по карточке — окно заказа"
            : "Тап по свободному слоту — новая запись · двойной клик по карточке — окно заказа · перетаскивание и край справа — как раньше"}
        </p>
        {readOnly ? null : (
          <button
            type="button"
            onClick={() =>
              setCreateDraft({
                postId: posts[0]?.id ?? "",
                offsetMin: clampBoardMinutes(
                  offsetMinutesFromDate(new Date()) >= 0
                    ? offsetMinutesFromDate(new Date())
                    : 0,
                  60,
                ),
              })
            }
            className="min-h-11 cursor-pointer rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(196,92,38,0.28)] hover:bg-[var(--accent-deep)]"
          >
            Новая запись
          </button>
        )}
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
        <div className="min-w-[920px]">
          <div
            className="grid border-b border-[var(--line)] bg-[var(--paper)]/90"
            style={{ gridTemplateColumns: "168px 1fr" }}
          >
            <div className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
              Пост
              <span className="mt-0.5 block font-normal normal-case tracking-normal text-[10px]">
                часы у каждого свои
              </span>
            </div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${BOARD_HOURS.length}, minmax(0, 1fr))`,
              }}
            >
              {BOARD_HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-l border-[var(--line)] px-1 py-3 text-center text-xs font-semibold text-[var(--ink-soft)]"
                >
                  {hourLabel(hour)}
                </div>
              ))}
            </div>
          </div>

          {posts.map((post) => {
            const rowBlocks = displayBlocks.filter((b) => b.postId === post.id);
            const postStart = post.workStartHour ?? BOARD_START_HOUR;
            const postEnd = post.workEndHour ?? BOARD_END_HOUR;
            const muteLeftPct = Math.max(
              0,
              ((postStart - BOARD_START_HOUR) / (BOARD_END_HOUR - BOARD_START_HOUR)) *
                100,
            );
            const muteRightPct = Math.max(
              0,
              ((BOARD_END_HOUR - postEnd) / (BOARD_END_HOUR - BOARD_START_HOUR)) *
                100,
            );
            return (
              <div
                key={post.id}
                className="grid border-b border-[var(--line)] last:border-b-0"
                style={{ gridTemplateColumns: "168px 1fr" }}
              >
                <div className="flex flex-col justify-center gap-1 border-r border-[var(--line)] bg-[var(--paper)]/40 px-3 py-4">
                  <p className="font-semibold text-[var(--ink)]">{post.name}</p>
                  <p className="text-xs font-medium text-[var(--teal)]">
                    {hourLabel(postStart)}–{hourLabel(postEnd)}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {rowBlocks.length === 0
                      ? "Свободен"
                      : `${rowBlocks.length} занят.`}
                  </p>
                </div>
                <div
                  ref={(el) => {
                    trackRefs.current[post.id] = el;
                  }}
                  className={`relative h-32 bg-[var(--paper)]/30 ${
                    readOnly ? "cursor-default" : "cursor-cell"
                  }`}
                  onClick={(e) => onTrackClick(post.id, e)}
                >
                  <div
                    className="pointer-events-none absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: `repeat(${BOARD_HOURS.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {BOARD_HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="border-l border-[var(--line)]/70"
                      />
                    ))}
                  </div>
                  {muteLeftPct > 0 ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--ink)]/6"
                      style={{ width: `${muteLeftPct}%` }}
                      aria-hidden
                    />
                  ) : null}
                  {muteRightPct > 0 ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 bg-[var(--ink)]/6"
                      style={{ width: `${muteRightPct}%` }}
                      aria-hidden
                    />
                  ) : null}

                  {rowBlocks.map((block) => {
                    const offset = clampBoardMinutes(
                      offsetMinutesFromDate(new Date(block.startsAt)),
                      block.durationMin,
                    );
                    const leftPct = pctFromOffset(offset);
                    const widthPct = pctFromOffset(block.durationMin);
                    const active = selectedId === block.id;
                    return (
                      <div
                        key={`${block.kind}-${block.id}`}
                        role="button"
                        tabIndex={0}
                        title="Двойной клик — открыть карточку"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (didDrag.current) {
                            didDrag.current = false;
                            return;
                          }
                          setCreateDraft(null);
                          setSelectedId(block.id);
                        }}
                        onClick={(e) => {
                          // Одиночный клик не открывает карточку (иначе конфликтует с drag).
                          e.stopPropagation();
                          if (didDrag.current) {
                            didDrag.current = false;
                          }
                        }}
                        onPointerDown={(e) => beginDrag(e, block, "move")}
                        className={`absolute top-2 bottom-2 overflow-hidden rounded-md border px-2 py-1.5 ${
                          readOnly ? "" : "touch-none"
                        } ${blockTone(block.kind, block.status)} ${
                          active ? "ring-2 ring-[var(--accent)] ring-offset-1" : ""
                        } ${drag?.id === block.id ? "opacity-90 z-10" : ""} ${
                          readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                        }`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${Math.max(widthPct, 2.5)}%`,
                        }}
                      >
                        <p className="truncate text-xs font-semibold leading-tight">
                          {block.title}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] opacity-80">
                          {block.subtitle}
                        </p>
                        <p className="mt-1 truncate text-[10px] font-medium opacity-75">
                          {formatClock(block.startsAt)} · {block.durationMin} мин ·{" "}
                          {statusText(block.kind, block.status)}
                          {showFinance &&
                          typeof block.plannedAmountRub === "number"
                            ? ` · ${formatRub(block.plannedAmountRub)}`
                            : ""}
                        </p>
                        {!readOnly && block.kind === "booking" ? (
                          <button
                            type="button"
                            aria-label="Изменить длительность"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              beginDrag(e, block, "resize");
                            }}
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize bg-black/10 hover:bg-black/20"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LoadBoardLegendStatic readOnly={readOnly} />

      {selected ? (
        <DetailPanel
          block={selected}
          posts={posts}
          catalog={services}
          customers={customers}
          readOnly={readOnly}
          showFinance={showFinance}
          onClose={() => setSelectedId(null)}
          onSaved={(next) => {
            setBlocks((prev) =>
              prev.map((b) => (b.id === next.id ? next : b)),
            );
            startTransition(() => router.refresh());
          }}
          onRemoved={(id) => {
            setBlocks((prev) => prev.filter((b) => b.id !== id));
            setSelectedId(null);
            startTransition(() => router.refresh());
          }}
          onError={setError}
        />
      ) : null}

      {!readOnly && createDraft && posts.length > 0 ? (
        <CreatePanel
          draft={createDraft}
          day={day}
          posts={posts}
          customers={customers}
          services={services}
          showFinance={showFinance}
          onClose={() => setCreateDraft(null)}
          onCreated={(block) => {
            setBlocks((prev) => [...prev, block]);
            setCreateDraft(null);
            setSelectedId(block.id);
            startTransition(() => router.refresh());
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

const WORK_ORDER_LEGEND_STATUSES = ["IN_PROGRESS", "CLOSED"] as const;

function LoadBoardLegendStatic({ readOnly }: { readOnly?: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          Заказ-наряды по статусам
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--ink)]">
          {WORK_ORDER_LEGEND_STATUSES.map((status) => (
            <span key={status} className="inline-flex items-center gap-2">
              <span
                className={`h-3.5 w-3.5 shrink-0 rounded-sm ${WORK_ORDER_STATUS_SWATCH[status]}`}
                aria-hidden
              />
              {workOrderStatusLabel[status]}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-soft)]">
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm bg-[#f4e8c8]" />
          Запись (новая)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm bg-[#9a6b16]" />
          Запись от клиента
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm border border-[var(--ink)]/15 bg-white" />
          Запись (подтверждена)
        </span>
        <span>
          {readOnly
            ? "Режим сотрудника · только просмотр"
            : `Перетаскивание · ${BOARD_SNAP_MIN} мин`}
        </span>
      </div>
    </div>
  );
}

type SelectedService = {
  serviceId: string | null;
  name: string;
  priceRub: number;
  durationMin: number;
  quantity: number;
};

function catalogTotal(selected: SelectedService[]) {
  return selected.reduce((s, l) => s + l.priceRub * l.quantity, 0);
}

function catalogDuration(selected: SelectedService[]) {
  return Math.max(
    15,
    selected.reduce((s, l) => s + l.durationMin * l.quantity, 0),
  );
}

function ServicePicker({
  catalog,
  selectedIds,
  onToggle,
}: {
  catalog: ServiceOpt[];
  selectedIds: Set<string>;
  onToggle: (service: ServiceOpt) => void;
}) {
  if (catalog.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-soft)]">
        Нет услуг в прайсе. Добавьте их в справочнике.
      </p>
    );
  }
  return (
    <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--paper)]/50 p-3">
      {catalog.map((s) => {
        const on = selectedIds.has(s.id);
        return (
          <li key={s.id}>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(s)}
                className="mt-1"
              />
              <span className="flex-1">
                <span className="font-medium text-[var(--ink)]">{s.name}</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  {formatRub(s.priceRub)} · {s.durationMin} мин
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function DetailPanel({
  block,
  posts,
  catalog,
  customers,
  readOnly = false,
  showFinance = false,
  onClose,
  onSaved,
  onRemoved,
  onError,
}: {
  block: DeskBlock;
  posts: Post[];
  catalog: ServiceOpt[];
  customers: CustomerOpt[];
  readOnly?: boolean;
  showFinance?: boolean;
  onClose: () => void;
  onSaved: (block: DeskBlock) => void;
  onRemoved: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [postId, setPostId] = useState(block.postId);
  const [startsLocal, setStartsLocal] = useState(localInputValue(block.startsAt));
  const [durationMin, setDurationMin] = useState(block.durationMin);
  const [status, setStatus] = useState(block.status);
  const [vehicleInfo, setVehicleInfo] = useState(block.vehicleInfo);
  const [selected, setSelected] = useState<SelectedService[]>(() =>
    (block.lineItems ?? []).map((l) => ({
      serviceId: l.serviceId,
      name: l.name,
      priceRub: l.priceRub,
      durationMin: l.durationMin,
      quantity: l.quantity,
    })),
  );
  const [plannedAmount, setPlannedAmount] = useState(
    block.plannedAmountRub ?? 0,
  );
  const [amountTouched, setAmountTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [arriveVehicleId, setArriveVehicleId] = useState(
    block.vehicleId ?? "",
  );

  const bookingCustomer = useMemo(() => {
    if (block.kind !== "booking") return null;
    if (block.customerId) {
      return customers.find((c) => c.id === block.customerId) ?? null;
    }
    return null;
  }, [block, customers]);

  const bookingVehicles = bookingCustomer?.vehicles ?? [];

  useEffect(() => {
    setPostId(block.postId);
    setStartsLocal(localInputValue(block.startsAt));
    setDurationMin(block.durationMin);
    setStatus(block.status);
    setVehicleInfo(block.vehicleInfo);
    setArriveVehicleId(block.vehicleId ?? "");
    setCancelOpen(false);
    setCancelReason("");
    const lines = (block.lineItems ?? []).map((l) => ({
      serviceId: l.serviceId,
      name: l.name,
      priceRub: l.priceRub,
      durationMin: l.durationMin,
      quantity: l.quantity,
    }));
    setSelected(lines);
    setPlannedAmount(block.plannedAmountRub ?? catalogTotal(lines));
    setAmountTouched(false);
  }, [block]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const l of selected) {
      if (l.serviceId) set.add(l.serviceId);
      else {
        const match = catalog.find((c) => c.name === l.name);
        if (match) set.add(match.id);
      }
    }
    return set;
  }, [selected, catalog]);

  function toggleService(service: ServiceOpt) {
    setSelected((prev) => {
      const exists = prev.some(
        (l) => l.serviceId === service.id || l.name === service.name,
      );
      const next = exists
        ? prev.filter(
            (l) => l.serviceId !== service.id && l.name !== service.name,
          )
        : [
            ...prev,
            {
              serviceId: service.id,
              name: service.name,
              priceRub: service.priceRub,
              durationMin: service.durationMin,
              quantity: 1,
            },
          ];
      setDurationMin(catalogDuration(next));
      if (!amountTouched) setPlannedAmount(catalogTotal(next));
      return next;
    });
  }

  async function save() {
    setPending(true);
    const startsAt = new Date(startsLocal);
    if (Number.isNaN(startsAt.getTime())) {
      onError("Некорректное время");
      setPending(false);
      return;
    }
    if (block.kind === "booking") {
      if (selected.length === 0) {
        onError("Выберите хотя бы одну услугу");
        setPending(false);
        return;
      }
      const result = await updateDeskBooking({
        id: block.id,
        postId,
        startsAtIso: startsAt.toISOString(),
        durationMin,
        status,
        vehicleInfo,
        plannedAmountRub: plannedAmount,
        lines: selected,
      });
      setPending(false);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onSaved({
        ...block,
        postId,
        startsAt: startsAt.toISOString(),
        durationMin: snapMinutes(durationMin),
        status,
        title: selected[0]?.name ?? block.title,
        services: selected.map((l) => l.name),
        vehicleInfo,
        subtitle: vehicleInfo || block.clientName,
        plannedAmountRub: plannedAmount,
        lineItems: selected,
      });
    } else {
      const result = await updateDeskWorkOrder({
        id: block.id,
        postId,
        startsAtIso: startsAt.toISOString(),
        status,
      });
      setPending(false);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onSaved({
        ...block,
        postId,
        startsAt: startsAt.toISOString(),
        status,
      });
    }
  }

  async function cancelBooking() {
    setPending(true);
    const result = await cancelDeskBooking({
      id: block.id,
      reason: cancelReason,
    });
    setPending(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onRemoved(block.id);
  }

  async function arriveAndCreateWorkOrder() {
    if (bookingVehicles.length > 1 && !arriveVehicleId) {
      onError("Выберите автомобиль для заказ-наряда");
      return;
    }
    setPending(true);
    const result = await createWorkOrderFromBooking({
      bookingId: block.id,
      vehicleId: arriveVehicleId || undefined,
    });
    setPending(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onRemoved(block.id);
    if (result.workOrderId) {
      router.push(`/owner/work-orders/${result.workOrderId}`);
    }
  }

  const canArrive =
    block.kind === "booking" &&
    !block.workOrderId &&
    block.status !== "CANCELLED";

  const heading =
    block.kind === "work_order" && block.workOrderNumber
      ? `ЗН-${String(block.workOrderNumber).padStart(4, "0")}`
      : block.title;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/45 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_24px_60px_rgba(20,32,42,0.28)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              {block.kind === "booking" ? "Запись" : "Заказ-наряд"}
            </p>
            <h2
              id="order-detail-title"
              className="brand-mark mt-1 text-2xl text-[var(--ink)]"
            >
              {heading}
            </h2>
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
            <dt className="text-xs text-[var(--ink-soft)]">Клиент</dt>
            <dd className="font-medium">{block.clientName}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-soft)]">Авто</dt>
            <dd className="font-medium">{block.vehicleInfo || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-soft)]">Пост</dt>
            <dd className="font-medium">
              {posts.find((p) => p.id === block.postId)?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-soft)]">Время</dt>
            <dd className="font-medium">
              {formatClock(block.startsAt)} · {block.durationMin} мин
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-soft)]">Статус</dt>
            <dd className="font-medium">
              {statusText(block.kind, block.status)}
            </dd>
          </div>
          {showFinance && typeof block.plannedAmountRub === "number" ? (
            <div>
              <dt className="text-xs text-[var(--ink-soft)]">План, ₽</dt>
              <dd className="font-medium">
                {formatRub(block.plannedAmountRub)}
              </dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--ink-soft)]">Услуги</dt>
            <dd className="font-medium">{block.services.join(", ")}</dd>
          </div>
        </dl>

        {readOnly ? (
          <div className="mt-2 flex flex-wrap gap-3">
            {block.kind === "work_order" ? (
              <a
                href={`/owner/work-orders/${block.id}`}
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-5 text-sm font-semibold"
              >
                Полная карточка ЗН
              </a>
            ) : null}
            <p className="self-center text-xs text-[var(--ink-soft)]">
              Редактирование недоступно в режиме сотрудника
            </p>
          </div>
        ) : (
          <>
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
                <span className="mb-1.5 block font-semibold">Начало</span>
                <input
                  type="datetime-local"
                  value={startsLocal}
                  onChange={(e) => setStartsLocal(e.target.value)}
                  className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                />
              </label>
              {block.kind === "booking" ? (
                <>
                  <div className="sm:col-span-2">
                    <p className="mb-1.5 text-sm font-semibold">Услуги</p>
                    <ServicePicker
                      catalog={catalog}
                      selectedIds={selectedIds}
                      onToggle={toggleService}
                    />
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-semibold">
                      Длительность, мин
                    </span>
                    <input
                      type="number"
                      min={15}
                      step={15}
                      value={durationMin}
                      onChange={(e) =>
                        setDurationMin(Number(e.target.value) || 15)
                      }
                      className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-semibold">
                      План суммы, ₽
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={plannedAmount}
                      onChange={(e) => {
                        setAmountTouched(true);
                        setPlannedAmount(Number(e.target.value) || 0);
                      }}
                      className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                    />
                    <span className="mt-1 block text-xs text-[var(--ink-soft)]">
                      По каталогу: {formatRub(catalogTotal(selected))}
                    </span>
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1.5 block font-semibold">
                      Авто / госномер
                    </span>
                    <input
                      value={vehicleInfo}
                      onChange={(e) => setVehicleInfo(e.target.value)}
                      className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                    />
                  </label>
                </>
              ) : null}
              <label className="block text-sm">
                <span className="mb-1.5 block font-semibold">Статус</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                >
                  {block.kind === "booking"
                    ? selectableBookingStatuses(
                        block.status as BookingStatus,
                      ).map((value) => (
                        <option key={value} value={value}>
                          {bookingStatusLabel[value]}
                        </option>
                      ))
                    : selectableWorkOrderStatuses(
                        block.status as WorkOrderStatus,
                      ).map((value) => (
                        <option key={value} value={value}>
                          {workOrderStatusLabel[value]}
                        </option>
                      ))}
                </select>
              </label>
            </div>

            {canArrive ? (
              <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--paper)]/60 p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Клиент приехал
                </p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Создать заказ-наряд из этой записи и открыть карточку ЗН.
                </p>
                {bookingVehicles.length > 1 ? (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1.5 block font-semibold">Авто</span>
                    <select
                      value={arriveVehicleId}
                      onChange={(e) => setArriveVehicleId(e.target.value)}
                      className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                    >
                      <option value="">Выберите автомобиль</option>
                      {bookingVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {vehicleLabel(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void arriveAndCreateWorkOrder()}
                  className="mt-3 min-h-11 cursor-pointer rounded-md bg-[var(--teal)] px-5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Создание…" : "Создать заказ-наряд"}
                </button>
              </div>
            ) : null}

            {block.kind === "booking" && cancelOpen ? (
              <div className="mt-5 rounded-lg border border-[var(--line)] bg-white p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Причина отмены
                </p>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="Например: клиент передумал / не отвечает"
                  className="mt-2 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void cancelBooking()}
                    className="min-h-11 cursor-pointer rounded-md bg-[var(--accent-deep)] px-5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Подтвердить отмену
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setCancelOpen(false);
                      setCancelReason("");
                    }}
                    className="min-h-11 cursor-pointer rounded-md border border-[var(--line)] px-5 text-sm font-semibold"
                  >
                    Назад
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => void save()}
                className="min-h-11 cursor-pointer rounded-md bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Сохранение…" : "Сохранить"}
              </button>
              {block.kind === "work_order" ? (
                <a
                  href={`/owner/work-orders/${block.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-5 text-sm font-semibold"
                >
                  Полная карточка ЗН
                </a>
              ) : null}
              {block.kind === "booking" && !cancelOpen ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setCancelOpen(true)}
                  className="min-h-11 cursor-pointer rounded-md border border-[var(--line)] px-5 text-sm font-semibold text-[var(--accent-deep)]"
                >
                  Отменить запись
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CreatePanel({
  draft,
  day,
  posts,
  customers,
  services,
  showFinance = false,
  onClose,
  onCreated,
  onError,
}: {
  draft: CreateDraft;
  day: Date;
  posts: Post[];
  customers: CustomerOpt[];
  services: ServiceOpt[];
  showFinance?: boolean;
  onClose: () => void;
  onCreated: (block: DeskBlock) => void;
  onError: (msg: string) => void;
}) {
  const defaultService = services[0];
  const [postId, setPostId] = useState(draft.postId || posts[0]?.id || "");
  const [startsLocal, setStartsLocal] = useState(
    localInputValue(dateFromDayOffset(day, draft.offsetMin).toISOString()),
  );
  const [selected, setSelected] = useState<SelectedService[]>(() =>
    defaultService
      ? [
          {
            serviceId: defaultService.id,
            name: defaultService.name,
            priceRub: defaultService.priceRub,
            durationMin: defaultService.durationMin,
            quantity: 1,
          },
        ]
      : [],
  );
  const [durationMin, setDurationMin] = useState(
    defaultService?.durationMin ?? 60,
  );
  const [plannedAmount, setPlannedAmount] = useState(
    defaultService?.priceRub ?? 0,
  );
  const [amountTouched, setAmountTouched] = useState(false);
  const [phoneQuery, setPhoneQuery] = useState("");
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleInfoManual, setVehicleInfoManual] = useState("");
  const [pending, setPending] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPostId(draft.postId || posts[0]?.id || "");
    setStartsLocal(
      localInputValue(dateFromDayOffset(day, draft.offsetMin).toISOString()),
    );
  }, [draft, day, posts]);

  useEffect(() => {
    phoneInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const phoneMatches = useMemo(
    () => customersByPhoneQuery(customers, phoneQuery),
    [customers, phoneQuery],
  );

  const matchedCustomer = useMemo(() => {
    if (pickedCustomerId) {
      return customers.find((c) => c.id === pickedCustomerId) ?? null;
    }
    if (phoneMatches.length === 1) return phoneMatches[0];
    return null;
  }, [customers, pickedCustomerId, phoneMatches]);

  const isNewClient =
    phoneDigits(phoneQuery).length >= 3 &&
    phoneMatches.length === 0 &&
    !matchedCustomer;

  const customerVehicles = matchedCustomer?.vehicles ?? [];
  const matchedCustomerId = matchedCustomer?.id ?? null;

  useEffect(() => {
    if (!matchedCustomerId || !matchedCustomer) {
      setVehicleId("");
      return;
    }
    const vehicles = matchedCustomer.vehicles;
    if (vehicles.length === 1) {
      setVehicleId(vehicles[0].id);
      setVehicleInfoManual("");
    } else if (vehicles.length === 0) {
      setVehicleId("");
    } else {
      setVehicleId((prev) =>
        vehicles.some((v) => v.id === prev) ? prev : "",
      );
    }
  }, [matchedCustomerId, matchedCustomer]);

  const selectedVehicle =
    customerVehicles.find((v) => v.id === vehicleId) ?? null;

  const resolvedVehicleInfo = selectedVehicle
    ? vehicleLabel(selectedVehicle)
    : vehicleInfoManual.trim();

  const selectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const l of selected) {
      if (l.serviceId) set.add(l.serviceId);
    }
    return set;
  }, [selected]);

  function onPhoneChange(value: string) {
    setPhoneQuery(value);
    setPickedCustomerId(null);
    setNewName("");
  }

  function pickCustomer(c: CustomerOpt) {
    setPickedCustomerId(c.id);
    setPhoneQuery(c.phone);
    setNewName("");
  }

  function toggleService(service: ServiceOpt) {
    setSelected((prev) => {
      const exists = prev.some((l) => l.serviceId === service.id);
      const next = exists
        ? prev.filter((l) => l.serviceId !== service.id)
        : [
            ...prev,
            {
              serviceId: service.id,
              name: service.name,
              priceRub: service.priceRub,
              durationMin: service.durationMin,
              quantity: 1,
            },
          ];
      setDurationMin(catalogDuration(next));
      if (!amountTouched) setPlannedAmount(catalogTotal(next));
      return next;
    });
  }

  async function submit() {
    setPending(true);
    const startsAt = new Date(startsLocal);
    if (Number.isNaN(startsAt.getTime())) {
      onError("Некорректное время");
      setPending(false);
      return;
    }
    if (selected.length === 0) {
      onError("Выберите хотя бы одну услугу");
      setPending(false);
      return;
    }
    if (!matchedCustomer && !isNewClient) {
      onError("Введите телефон клиента — найдём в базе или создадим нового");
      setPending(false);
      return;
    }
    if (isNewClient && !newName.trim()) {
      onError("Укажите имя нового клиента");
      setPending(false);
      return;
    }
    if (matchedCustomer && customerVehicles.length > 1 && !vehicleId) {
      onError("Выберите автомобиль клиента");
      setPending(false);
      return;
    }

    const result = await createDeskBooking({
      postId,
      startsAtIso: startsAt.toISOString(),
      durationMin,
      plannedAmountRub: plannedAmount,
      lines: selected,
      customerId: matchedCustomer?.id,
      newCustomerName: isNewClient ? newName : undefined,
      newCustomerPhone: isNewClient ? phoneQuery : undefined,
      vehicleInfo: resolvedVehicleInfo,
      vehicleId: vehicleId || undefined,
    });
    setPending(false);
    if (!result.ok || !result.id) {
      onError(result.ok ? "Не удалось создать" : result.error);
      return;
    }
    const customerName =
      matchedCustomer?.name ?? (newName.trim() || "Клиент");
    const names = result.services ?? selected.map((l) => l.name);
    onCreated({
      id: result.id,
      kind: "booking",
      postId,
      title: names[0] ?? "Услуга",
      subtitle: resolvedVehicleInfo || customerName,
      startsAt: startsAt.toISOString(),
      durationMin: result.durationMin ?? snapMinutes(durationMin),
      status: "CONFIRMED",
      clientName: customerName,
      vehicleInfo: resolvedVehicleInfo,
      services: names,
      plannedAmountRub: result.plannedAmountRub ?? plannedAmount,
      customerId: result.customerId ?? matchedCustomer?.id ?? null,
      vehicleId: result.vehicleId ?? (vehicleId || null),
      workOrderId: null,
      lineItems: selected,
    });
  }

  const postName = posts.find((p) => p.id === postId)?.name ?? "пост";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/45 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-booking-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_24px_60px_rgba(20,32,42,0.28)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Новая запись
            </p>
            <h2
              id="create-booking-title"
              className="brand-mark mt-1 text-2xl text-[var(--ink)]"
            >
              {postName} · {startsLocal.slice(11, 16) || "время"}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Поиск клиента по телефону. Имя и авто подтянутся сами.
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

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1.5 block font-semibold">Телефон клиента</span>
            <input
              ref={phoneInputRef}
              value={phoneQuery}
              onChange={(e) => onPhoneChange(e.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
              placeholder="+7 9…"
              inputMode="tel"
              autoComplete="tel"
            />
            {phoneDigits(phoneQuery).length > 0 &&
            phoneDigits(phoneQuery).length < 3 ? (
              <span className="mt-1 block text-xs text-[var(--ink-soft)]">
                Введите ещё цифры для поиска
              </span>
            ) : null}
          </label>

          {matchedCustomer ? (
            <div className="rounded-md border border-[var(--teal)]/30 bg-[var(--teal-soft)]/40 px-3 py-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--teal)]">
                Клиент найден
              </p>
              <p className="mt-1 text-base font-semibold text-[var(--ink)]">
                {matchedCustomer.name}
              </p>
              <p className="text-sm text-[var(--ink-soft)]">
                {matchedCustomer.phone}
              </p>
            </div>
          ) : null}

          {!matchedCustomer && phoneMatches.length > 1 ? (
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-semibold">Несколько совпадений</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--paper)]/50 p-2">
                {phoneMatches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pickCustomer(c)}
                      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-left text-sm hover:bg-white"
                    >
                      <span className="font-medium text-[var(--ink)]">
                        {c.name}
                      </span>
                      <span className="text-[var(--ink-soft)]">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {isNewClient ? (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-semibold">
                Имя нового клиента
              </span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                placeholder="Иван Иванов"
              />
              <span className="mt-1 block text-xs text-[var(--ink-soft)]">
                Клиента с таким телефоном ещё нет — создадим вместе с записью
              </span>
            </label>
          ) : null}

          {matchedCustomer && customerVehicles.length > 1 ? (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-semibold">Автомобиль</span>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
              >
                <option value="">Выберите авто</option>
                {customerVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {matchedCustomer && customerVehicles.length === 1 ? (
            <div className="sm:col-span-2 rounded-md border border-[var(--line)] bg-[var(--paper)]/50 px-3 py-3 text-sm">
              <p className="text-xs text-[var(--ink-soft)]">Автомобиль</p>
              <p className="font-medium text-[var(--ink)]">
                {vehicleLabel(customerVehicles[0])}
              </p>
            </div>
          ) : null}

          {(!matchedCustomer || customerVehicles.length === 0) &&
          (isNewClient || matchedCustomer) ? (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-semibold">
                Авто / госномер
                {matchedCustomer ? " (нет в базе — укажите вручную)" : ""}
              </span>
              <input
                value={vehicleInfoManual}
                onChange={(e) => setVehicleInfoManual(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                placeholder="Toyota Camry · А123ВС777"
              />
            </label>
          ) : null}

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
            <span className="mb-1.5 block font-semibold">Начало</span>
            <input
              type="datetime-local"
              value={startsLocal}
              onChange={(e) => setStartsLocal(e.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
            />
          </label>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-semibold">Услуги</p>
            <ServicePicker
              catalog={services}
              selectedIds={selectedIds}
              onToggle={toggleService}
            />
          </div>

          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold">Длительность, мин</span>
            <input
              type="number"
              min={15}
              step={15}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value) || 15)}
              className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold">План суммы, ₽</span>
            <input
              type="number"
              min={0}
              step={50}
              value={plannedAmount}
              onChange={(e) => {
                setAmountTouched(true);
                setPlannedAmount(Number(e.target.value) || 0);
              }}
              className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
            />
            <span className="mt-1 block text-xs text-[var(--ink-soft)]">
              По каталогу: {formatRub(catalogTotal(selected))}
              {showFinance ? "" : " · сумма сохраняется в записи"}
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void submit()}
            className="min-h-11 cursor-pointer rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Создание…" : "Создать запись"}
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
