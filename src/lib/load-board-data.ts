import type { BoardBlock } from "@/lib/load-board";
import { workOrderDuration, workOrderNumberLabel } from "@/lib/work-order";
import { prisma } from "@/lib/prisma";

const BOOKING_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "DONE",
]);

const WORK_ORDER_STATUSES = new Set(["OPEN", "IN_PROGRESS", "DONE"]);

function inDay(date: Date | null | undefined, dayStart: Date, dayEnd: Date) {
  if (!date) return false;
  const t = date.getTime();
  return t >= dayStart.getTime() && t <= dayEnd.getTime();
}

/**
 * Load board occupancy for one org/day.
 * Prisma `where` stays minimal so Windows/SQLite clients don't hit
 * PrismaClientValidationError on enum/nullable filters.
 * Optional `postIds` limits rows (e.g. STAFF assigned posts only).
 */
export async function loadBoardOccupancy(
  organizationId: string,
  dayStart: Date,
  dayEnd: Date,
  options?: { postIds?: string[] },
) {
  const postIdFilter = options?.postIds;
  const [postsRaw, bookingsRaw, workOrdersRaw, customers, services] =
    await Promise.all([
      prisma.servicePost.findMany({
        where: { organizationId, isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.booking.findMany({
        where: {
          organizationId,
          startsAt: { gte: dayStart, lte: dayEnd },
        },
        include: { client: true, lines: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.workOrder.findMany({
        where: { organizationId },
        include: {
          customer: true,
          vehicle: true,
          lines: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.customer.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        take: 200,
      }),
      prisma.service.findMany({
        where: { organizationId, isActive: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const posts =
    postIdFilter == null
      ? postsRaw
      : postsRaw.filter((p) => postIdFilter.includes(p.id));

  const allowedPost = (postId: string | null | undefined) =>
    postId != null &&
    (postIdFilter == null || postIdFilter.includes(postId));

  const bookings = bookingsRaw.filter(
    (b) =>
      allowedPost(b.postId) &&
      BOOKING_STATUSES.has(String(b.status)) &&
      inDay(b.startsAt, dayStart, dayEnd),
  );

  const workOrders = workOrdersRaw
    .filter(
      (wo) =>
        allowedPost(wo.postId) &&
        wo.scheduledAt != null &&
        WORK_ORDER_STATUSES.has(String(wo.status)) &&
        inDay(wo.scheduledAt, dayStart, dayEnd),
    )
    .sort(
      (a, b) =>
        (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0),
    );

  const blocks: BoardBlock[] = [
    ...bookings.map((b) => {
      const serviceNames =
        b.lines.length > 0
          ? b.lines.map((l) => l.name)
          : b.serviceName
            ? [b.serviceName]
            : ["Услуга"];
      return {
        id: b.id,
        kind: "booking" as const,
        postId: b.postId as string,
        title: serviceNames[0] ?? b.serviceName,
        subtitle: b.vehicleInfo ?? b.client.name ?? "Клиент",
        startsAt: b.startsAt,
        durationMin: b.durationMin ?? 60,
        status: String(b.status),
        href: "/owner/bookings",
        clientName: b.client.name,
        vehicleInfo: b.vehicleInfo ?? "",
        services: serviceNames,
        plannedAmountRub: b.plannedAmountRub,
        lineItems: b.lines.map((l) => ({
          serviceId: l.serviceId,
          name: l.name,
          priceRub: l.priceRub,
          durationMin: l.durationMin,
          quantity: l.quantity,
        })),
      };
    }),
    ...workOrders.map((wo) => ({
      id: wo.id,
      kind: "work_order" as const,
      postId: wo.postId as string,
      title: `${workOrderNumberLabel(wo.number)} · ${wo.lines[0]?.name ?? "Работы"}`,
      subtitle: `${wo.customer.name} · ${wo.vehicle.plate}`,
      startsAt: wo.scheduledAt as Date,
      durationMin: Math.max(30, workOrderDuration(wo.lines)),
      status: String(wo.status),
      href: `/owner/work-orders/${wo.id}`,
      clientName: wo.customer.name,
      vehicleInfo: `${wo.vehicle.make} ${wo.vehicle.model} · ${wo.vehicle.plate}`,
      services: wo.lines.map((l) => l.name),
      workOrderNumber: wo.number,
      plannedAmountRub: wo.lines.reduce(
        (s, l) => s + l.priceRub * l.quantity,
        0,
      ),
    })),
  ];

  const bookingPlannedTotal = bookings.reduce(
    (sum, b) => sum + (b.plannedAmountRub || 0),
    0,
  );

  return {
    posts,
    blocks,
    bookingPlannedTotal,
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
    })),
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMin: s.durationMin,
      priceRub: s.priceRub,
    })),
  };
}
