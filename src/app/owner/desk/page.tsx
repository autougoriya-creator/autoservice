import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import {
  addDays,
  endOfLocalDay,
  formatBoardDateParam,
  parseBoardDate,
  startOfLocalDay,
  type BoardBlock,
} from "@/lib/load-board";
import { workOrderDuration, workOrderNumberLabel } from "@/lib/work-order";
import { SectionTitle } from "@/components/ui";
import { LoadBoardGrid, LoadBoardLegend } from "@/components/load-board";

export default async function ManagerDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
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

  // Avoid nullable `{ not: null }` filters (PrismaClientValidationError on some
  // Windows/SQLite client builds). Filter assigned posts in JS instead.
  const [posts, bookingsRaw, workOrdersRaw] = await Promise.all([
    prisma.servicePost.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        organizationId,
        status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS", "DONE"] },
        startsAt: { gte: dayStart, lte: dayEnd },
      },
      include: { client: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.workOrder.findMany({
      where: {
        organizationId,
        status: { in: ["OPEN", "IN_PROGRESS", "DONE"] },
        AND: [
          { scheduledAt: { gte: dayStart } },
          { scheduledAt: { lte: dayEnd } },
        ],
      },
      include: {
        customer: true,
        vehicle: true,
        lines: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const bookings = bookingsRaw.filter((b) => b.postId != null);
  const workOrders = workOrdersRaw
    .filter((wo) => wo.postId != null && wo.scheduledAt != null)
    .sort(
      (a, b) =>
        (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0),
    );

  const blocks: BoardBlock[] = [
    ...bookings.map((b) => ({
      id: b.id,
      kind: "booking" as const,
      postId: b.postId as string,
      title: b.serviceName,
      subtitle: b.vehicleInfo ?? b.client.name ?? "Клиент",
      startsAt: b.startsAt,
      durationMin: b.durationMin,
      status: b.status,
      href: "/owner/bookings",
    })),
    ...workOrders.map((wo) => ({
      id: wo.id,
      kind: "work_order" as const,
      postId: wo.postId as string,
      title: `${workOrderNumberLabel(wo.number)} · ${wo.lines[0]?.name ?? "Работы"}`,
      subtitle: `${wo.customer.name} · ${wo.vehicle.plate}`,
      startsAt: wo.scheduledAt as Date,
      durationMin: Math.max(30, workOrderDuration(wo.lines)),
      status: wo.status,
      href: `/owner/work-orders/${wo.id}`,
    })),
  ];

  const occupied = blocks.length;
  const freePosts = posts.filter(
    (p) => !blocks.some((b) => b.postId === p.id),
  ).length;

  return (
    <div>
      <SectionTitle
        eyebrow="Загрузка"
        title="Рабочий стол"
        description="День по часам и постам: занятые слоты — записи и заказ-наряды, пустые ячейки свободны."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/owner/desk?date=${prev}`}
            className="rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--ink)]/30"
          >
            ← Вчера
          </Link>
          <Link
            href={`/owner/desk?date=${today}`}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              isToday
                ? "bg-[var(--ink)] text-white"
                : "border border-[var(--line)] bg-white/80 text-[var(--ink)] hover:border-[var(--ink)]/30"
            }`}
          >
            Сегодня
          </Link>
          <Link
            href={`/owner/desk?date=${next}`}
            className="rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--ink)]/30"
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
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] bg-white/70 px-6 py-10 text-center text-sm text-[var(--ink-soft)]">
          Нет активных постов. Добавьте боксы в настройках точки.
        </div>
      ) : (
        <>
          <LoadBoardGrid posts={posts} blocks={blocks} />
          <LoadBoardLegend />
        </>
      )}
    </div>
  );
}
