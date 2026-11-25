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
import { BOARD_BOOKING_STATUSES } from "@/lib/booking";
import { SectionTitle } from "@/components/ui";
import { InteractiveDesk } from "@/components/interactive-desk";
import { DeskDateNav } from "@/components/desk-date-nav";
import Link from "next/link";

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
  const dayIsoParam = formatBoardDateParam(day);

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

  const calendarFrom = startOfLocalDay(addDays(day, -45));
  const calendarTo = endOfLocalDay(addDays(day, 45));
  const staffPostFilter =
    staffView && staffPostIds && staffPostIds.length > 0
      ? { postId: { in: staffPostIds } }
      : staffView
        ? { postId: "__none__" }
        : {};

  const [
    { posts, blocks, customers, services, bookingPlannedTotal },
    busyBookings,
    busyWorkOrders,
  ] = await Promise.all([
    loadBoardOccupancy(
      organizationId,
      dayStart,
      dayEnd,
      staffView ? { postIds: staffPostIds ?? [] } : undefined,
    ),
    prisma.booking.findMany({
      where: {
        organizationId,
        startsAt: { gte: calendarFrom, lte: calendarTo },
        ...staffPostFilter,
      },
      select: {
        startsAt: true,
        status: true,
        workOrderId: true,
        postId: true,
      },
    }),
    prisma.workOrder.findMany({
      where: {
        organizationId,
        scheduledAt: { gte: calendarFrom, lte: calendarTo },
        ...staffPostFilter,
      },
      select: { scheduledAt: true, status: true, postId: true },
    }),
  ]);

  const busyDates = new Set<string>();
  for (const b of busyBookings) {
    if (b.workOrderId) continue;
    if (!BOARD_BOOKING_STATUSES.has(String(b.status))) continue;
    busyDates.add(formatBoardDateParam(b.startsAt));
  }
  for (const wo of busyWorkOrders) {
    if (!wo.scheduledAt) continue;
    if (wo.status !== "IN_PROGRESS" && wo.status !== "CLOSED") continue;
    busyDates.add(formatBoardDateParam(wo.scheduledAt));
  }

  const occupied = blocks.length;
  const freePosts = posts.filter(
    (p) => !blocks.some((b) => b.postId === p.id),
  ).length;

  const occupiedLabel = (
    <>
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
    </>
  );

  return (
    <div>
      <SectionTitle
        eyebrow="Загрузка"
        title={staffView ? "Мой пост" : "Рабочий стол"}
        description={
          staffView
            ? "Просмотр загрузки закреплённых за вами постов. Только чтение — без перетаскивания и новых записей. Двойной клик по карточке — окно заказа."
            : "Интерактивная доска: тап по слоту — новая запись, двойной клик по карточке — окно заказа. Перетаскивание и длительность — без открытия."
        }
      />

      <DeskDateNav
        dayIsoParam={dayIsoParam}
        dateLabel={dateLabel}
        occupiedLabel={occupiedLabel}
        busyDates={[...busyDates]}
      />

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
