import Link from "next/link";
import {
  BOARD_HOURS,
  BOARD_START_HOUR,
  BOARD_END_HOUR,
  blockLayout,
  type BoardBlock,
} from "@/lib/load-board";
import { bookingStatusLabel, workOrderStatusLabel } from "@/lib/format";

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

function blockTone(kind: BoardBlock["kind"], status: string) {
  if (kind === "work_order") {
    if (status === "CLOSED")
      return "bg-[var(--teal)]/90 text-white border-transparent";
    // IN_PROGRESS (и любой неизвестный — как «в работе»)
    return "bg-[var(--accent)] text-white border-transparent";
  }
  if (status === "NEW_FROM_CLIENT")
    return "bg-[#9a6b16] text-white border-transparent";
  if (status === "CONFIRMED")
    return "bg-white text-[var(--ink)] border-[var(--ink)]/15 shadow-sm";
  return "bg-[#f4e8c8] text-[#7a5a12] border-transparent";
}

function statusText(kind: BoardBlock["kind"], status: string) {
  return kind === "work_order"
    ? workOrderStatusLabel[status] ?? status
    : bookingStatusLabel[status] ?? status;
}

export function LoadBoardGrid({
  posts,
  blocks,
}: {
  posts: {
    id: string;
    name: string;
    workStartHour?: number;
    workEndHour?: number;
  }[];
  blocks: BoardBlock[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white/90 shadow-[var(--shadow)]">
      <div className="min-w-[920px]">
        <div
          className="grid border-b border-[var(--line)] bg-[var(--paper)]/90"
          style={{ gridTemplateColumns: "168px 1fr" }}
        >
          <div className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            Пост
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${BOARD_HOURS.length}, minmax(0, 1fr))` }}
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
          const rowBlocks = blocks.filter((b) => b.postId === post.id);
          const postStart = post.workStartHour ?? BOARD_START_HOUR;
          const postEnd = post.workEndHour ?? BOARD_END_HOUR;
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
              <div className="relative h-28 bg-[var(--paper)]/30">
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{
                    gridTemplateColumns: `repeat(${BOARD_HOURS.length}, minmax(0, 1fr))`,
                  }}
                >
                  {BOARD_HOURS.map((hour) => (
                    <div key={hour} className="border-l border-[var(--line)]/70" />
                  ))}
                </div>

                {rowBlocks.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-md border border-dashed border-[var(--line)] bg-white/50 px-3 py-1 text-xs font-medium text-[var(--ink-soft)]">
                      Свободно
                    </span>
                  </div>
                ) : (
                  rowBlocks.map((block) => {
                    const { leftPct, widthPct } = blockLayout(
                      block.startsAt,
                      block.durationMin,
                    );
                    return (
                      <Link
                        key={`${block.kind}-${block.id}`}
                        href={block.href}
                        title={`${block.title} · ${statusText(block.kind, block.status)}`}
                        className={`absolute top-2 bottom-2 overflow-hidden rounded-md border px-2 py-1.5 transition hover:brightness-95 ${blockTone(block.kind, block.status)}`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                        }}
                      >
                        <p className="truncate text-xs font-semibold leading-tight">
                          {block.title}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] opacity-80">
                          {block.subtitle}
                        </p>
                        <p className="mt-1 truncate text-[10px] font-medium opacity-75">
                          {block.kind === "work_order" ? "ЗН" : "Запись"} ·{" "}
                          {statusText(block.kind, block.status)}
                        </p>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LoadBoardLegend() {
  const workOrderStatuses = [
    { status: "IN_PROGRESS", swatch: "bg-[var(--accent)]" },
    { status: "CLOSED", swatch: "bg-[var(--teal)]" },
  ] as const;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          Заказ-наряды по статусам
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--ink)]">
          {workOrderStatuses.map(({ status, swatch }) => (
            <span key={status} className="inline-flex items-center gap-2">
              <span className={`h-3.5 w-3.5 shrink-0 rounded-sm ${swatch}`} />
              {workOrderStatusLabel[status]}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-soft)]">
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm bg-[#f4e8c8]" />
          Запись новая
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm bg-[#9a6b16]" />
          Запись от клиента
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm border border-[var(--ink)]/15 bg-white" />
          Запись подтверждена
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm border border-dashed border-[var(--line)] bg-white/60" />
          Свободный слот
        </span>
      </div>
    </div>
  );
}
