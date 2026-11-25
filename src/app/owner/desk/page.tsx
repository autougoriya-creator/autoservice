import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatRub } from "@/lib/format";
import { isOwner, isStaff, orgIdOf, requireStaffSession } from "@/lib/tenant";
import {
  addDays,
  endOfLocalDay,
  formatBoardDateParam,
  parseBoardDate,
  startOfLocalDay,
  toDeskBlock,
} from "@/lib/load-board";
import { loadBoardOccupancy } from "@/lib/load-board-data";
import { SectionTitle } from "@/components/ui";
import { InteractiveDesk } from "@/components/interactive-desk";

export default async function ManagerDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const staffView = isStaff(session);
  const ownerFinance = isOwner(session);
  const { date: dateParam } = await searchParams;
  const day = parseBoardDate(dateParam);
  const dayStart = startOfLocalDay(day);
  const dayEnd = endOfLocalDay(day);
  const prev = formatBoardDateParam(addDays(day, -1));
  const next = formatBoardDateParam(addDays(day, 1));
  const today = formatBoardDateParam(startOfLocalDay(new Date()));
  const isToday = formatBoardDateParam(day) === today;

  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day);

  let staffPostIds: string[] | undefined;
  if (staffView) {
    const profile = await prisma.staffProfile.findFirst({
      where: {
        organizationId,
        userId: session.id,
        isActive: true,
      },
      include: {
        assignments: {
          where: { activeTo: null },
          select: { postId: true },
        },
      },
    });
    staffPostIds = profile?.assignments.map((a) => a.postId) ?? [];
  }

  const { posts, blocks, customers, services, bookingPlannedTotal } =
    await loadBoardOccupancy(
      organizationId,
      dayStart,
      dayEnd,
      staffView ? { postIds: staffPostIds ?? [] } : undefined,
    );

  const occupied = blocks.length;
  const freePosts = posts.filter(
    (p) => !blocks.some((b) => b.postId === p.id),
  ).length;

  return (
    <div>
      <SectionTitle
        eyebrow="Загрузка"
        title={staffView ? "Мой пост" : "Рабочий стол"}
        description={
          staffView
            ? "Просмотр загрузки закреплённых за вами постов. Только чтение — без перетаскивания и новых записей."
            : "Интерактивная доска: тап по слоту или карточке открывает окно поверх графика. Перетаскивание и длительность — как раньше."
        }
      />

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
            className={`min-h-11 rounded-md px-3 py-2 text-sm font-semibold ${
              isToday
                ? "bg-[var(--ink)] text-white"
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
        <div className="text-sm text-[var(--ink-soft)]">
          <span className="font-semibold capitalize text-[var(--ink)]">
            {dateLabel}
          </span>
          <span className="mx-2">·</span>
          {occupied} занято · {freePosts} пост(ов) без слотов
          {staffView ? (
            <>
              <span className="mx-2">·</span>
              <span className="font-semibold text-[var(--teal)]">только просмотр</span>
            </>
          ) : null}
          {ownerFinance ? (
            <>
              <span className="mx-2">·</span>
              <span className="font-semibold text-[var(--ink)]">
                план записей {formatRub(bookingPlannedTotal)}
              </span>
              <Link
                href="/owner/planned"
                className="ml-2 text-sm font-semibold text-[var(--accent)]"
              >
                План выручки →
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {staffView && posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] bg-white/70 px-6 py-10 text-center text-sm text-[var(--ink-soft)]">
          Вам ещё не закреплён пост. Обратитесь к владельцу или администратору.
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] bg-white/70 px-6 py-10 text-center text-sm text-[var(--ink-soft)]">
          Нет активных постов. Добавьте боксы в настройках точки.
        </div>
      ) : (
        <InteractiveDesk
          dayIso={dayStart.toISOString()}
          posts={posts.map((p) => ({
            id: p.id,
            name: p.name,
            workStartHour: p.workStartHour,
            workEndHour: p.workEndHour,
          }))}
          initialBlocks={blocks.map(toDeskBlock)}
          customers={customers}
          services={services}
          readOnly={staffView}
          showFinance={ownerFinance}
        />
      )}
    </div>
  );
}
