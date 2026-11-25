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
  createDeskBooking,
  moveDeskItem,
  updateDeskBooking,
  updateDeskWorkOrder,
} from "@/app/actions/desk";
import {
  bookingStatusLabel,
  formatRub,
  workOrderStatusLabel,
} from "@/lib/format";

type Post = { id: string; name: string };
type CustomerOpt = { id: string; name: string; phone: string };
type ServiceOpt = {
  id: string;
  name: string;
  durationMin: number;
  priceRub: number;
};

type DragState = {
  id: string;
  mode: "move" | "resize";
  originPostId: string;
  originOffset: number;
  originDuration: number;
  grabOffsetMin: number;
};

type CreateDraft = {
  postId: string;
  offsetMin: number;
};

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

function blockTone(kind: DeskBlock["kind"], status: string) {
  if (kind === "work_order") {
    if (status === "IN_PROGRESS")
      return "bg-[var(--accent)] text-white border-transparent";
    if (status === "CLOSED")
      return "bg-[var(--teal)]/90 text-white border-transparent";
    if (status === "CONFIRMED")
      return "bg-[#1a3a4a] text-white border-transparent";
    return "bg-[#243d4a] text-white border-transparent";
  }
  if (status === "IN_PROGRESS")
    return "bg-[var(--accent-deep)] text-white border-transparent";
  if (status === "DONE")
    return "bg-[var(--teal-soft)] text-[var(--teal)] border-transparent";
  if (status === "CONFIRMED")
    return "bg-white text-[var(--ink)] border-[var(--ink)]/15 shadow-sm";
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
        didDrag.current = true;
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
        didDrag.current = true;
      }
    },
    [drag],
  );

  const onPointerUp = useCallback(() => {
    if (!drag || !live) {
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
    e.preventDefault();
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
    setSelectedId(block.id);
    setCreateDraft(null);
    setDrag({
      id: block.id,
      mode,
      originPostId: block.postId,
      originOffset,
      originDuration: block.durationMin,
      grabOffsetMin: pointerOffset - originOffset,
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
            ? "Только просмотр закреплённых постов · тап по карточке — детали"
            : "Перетащите карточку на другой пост/время · край справа — длительность · тап по пустому месту — новая запись"}
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
              Пост · {hourLabel(BOARD_START_HOUR)}–{hourLabel(BOARD_END_HOUR)}
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
            return (
              <div
                key={post.id}
                className="grid border-b border-[var(--line)] last:border-b-0"
                style={{ gridTemplateColumns: "168px 1fr" }}
              >
                <div className="flex flex-col justify-center gap-1 border-r border-[var(--line)] bg-[var(--paper)]/40 px-3 py-4">
                  <p className="font-semibold text-[var(--ink)]">{post.name}</p>
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
                        onClick={(e) => {
                          e.stopPropagation();
                          if (didDrag.current) {
                            didDrag.current = false;
                            return;
                          }
                          setCreateDraft(null);
                          setSelectedId(block.id);
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
          readOnly={readOnly}
          showFinance={showFinance}
          onClose={() => setSelectedId(null)}
          onSaved={(next) => {
            setBlocks((prev) =>
              prev.map((b) => (b.id === next.id ? next : b)),
            );
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

function LoadBoardLegendStatic({ readOnly }: { readOnly?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-[var(--ink-soft)]">
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm border border-[var(--ink)]/15 bg-white" />
        Запись
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm bg-[#1a3a4a]" />
        Заказ-наряд
      </span>
      <span className="inline-flex items-center gap-2">
        {readOnly
          ? "Режим сотрудника · только просмотр"
          : `Перетаскивание · ${BOARD_SNAP_MIN} мин`}
      </span>
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
  readOnly = false,
  showFinance = false,
  onClose,
  onSaved,
  onError,
}: {
  block: DeskBlock;
  posts: Post[];
  catalog: ServiceOpt[];
  readOnly?: boolean;
  showFinance?: boolean;
  onClose: () => void;
  onSaved: (block: DeskBlock) => void;
  onError: (msg: string) => void;
}) {
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

  useEffect(() => {
    setPostId(block.postId);
    setStartsLocal(localInputValue(block.startsAt));
    setDurationMin(block.durationMin);
    setStatus(block.status);
    setVehicleInfo(block.vehicleInfo);
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

  return (
    <aside className="rounded-xl border border-[var(--line)] bg-white/95 p-5 shadow-[var(--shadow)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            {block.kind === "booking" ? "Запись" : "Заказ-наряд"}
          </p>
          <h2 className="brand-mark mt-1 text-2xl text-[var(--ink)]">
            {block.kind === "work_order" && block.workOrderNumber
              ? `ЗН-${String(block.workOrderNumber).padStart(4, "0")}`
              : block.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 cursor-pointer rounded-md border border-[var(--line)] px-4 text-sm font-semibold"
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
            <dd className="font-medium">{formatRub(block.plannedAmountRub)}</dd>
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
              Открыть карточку ЗН
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
                {Object.entries(
                  block.kind === "booking"
                    ? bookingStatusLabel
                    : workOrderStatusLabel,
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
                Открыть карточку ЗН
              </a>
            ) : null}
          </div>
        </>
      )}
    </aside>
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
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [mode, setMode] = useState<"existing" | "new">(
    customers.length ? "existing" : "new",
  );
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPostId(draft.postId || posts[0]?.id || "");
    setStartsLocal(
      localInputValue(dateFromDayOffset(day, draft.offsetMin).toISOString()),
    );
  }, [draft, day, posts]);

  const selectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const l of selected) {
      if (l.serviceId) set.add(l.serviceId);
    }
    return set;
  }, [selected]);

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
    const result = await createDeskBooking({
      postId,
      startsAtIso: startsAt.toISOString(),
      durationMin,
      plannedAmountRub: plannedAmount,
      lines: selected,
      customerId: mode === "existing" ? customerId : undefined,
      newCustomerName: mode === "new" ? newName : undefined,
      newCustomerPhone: mode === "new" ? newPhone : undefined,
      vehicleInfo,
    });
    setPending(false);
    if (!result.ok || !result.id) {
      onError(result.ok ? "Не удалось создать" : result.error);
      return;
    }
    const customerName =
      mode === "existing"
        ? (customers.find((c) => c.id === customerId)?.name ?? "Клиент")
        : newName.trim() || "Клиент";
    const names = result.services ?? selected.map((l) => l.name);
    onCreated({
      id: result.id,
      kind: "booking",
      postId,
      title: names[0] ?? "Услуга",
      subtitle: vehicleInfo || customerName,
      startsAt: startsAt.toISOString(),
      durationMin: result.durationMin ?? snapMinutes(durationMin),
      status: "CONFIRMED",
      clientName: customerName,
      vehicleInfo,
      services: names,
      plannedAmountRub: result.plannedAmountRub ?? plannedAmount,
      lineItems: selected,
    });
  }

  return (
    <aside className="rounded-xl border border-[var(--line)] bg-white/95 p-5 shadow-[var(--shadow)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            Новая запись
          </p>
          <h2 className="brand-mark mt-1 text-2xl">Создать на посту</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 cursor-pointer rounded-md border border-[var(--line)] px-4 text-sm font-semibold"
        >
          Отмена
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold ${
            mode === "existing"
              ? "bg-[var(--ink)] text-white"
              : "border border-[var(--line)]"
          }`}
        >
          Из базы
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold ${
            mode === "new"
              ? "bg-[var(--ink)] text-white"
              : "border border-[var(--line)]"
          }`}
        >
          Новый клиент
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "existing" ? (
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1.5 block font-semibold">Клиент</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold">Имя</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                placeholder="Иван Иванов"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold">Телефон</span>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
                placeholder="+7 …"
              />
            </label>
          </>
        )}

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
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1.5 block font-semibold">Авто / госномер</span>
          <input
            value={vehicleInfo}
            onChange={(e) => setVehicleInfo(e.target.value)}
            className="min-h-11 w-full rounded-md border border-[var(--line)] px-3"
            placeholder="Toyota Camry · А123ВС777"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => void submit()}
        className="mt-5 min-h-11 w-full cursor-pointer rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Создание…" : "Создать запись"}
      </button>
    </aside>
  );
}
