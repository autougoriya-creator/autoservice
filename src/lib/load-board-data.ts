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
 */
export async function loadBoardOccupancy(
  organizationId: string,
  dayStart: Date,
  dayEnd: Date,
) {
  const [posts, bookingsRaw, workOrdersRaw, customers, services] =
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
        include: { client: true },
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

  const bookings = bookingsRaw.filter(
    (b) =>
      b.postId != null &&
      BOOKING_STATUSES.has(String(b.status)) &&
      inDay(b.startsAt, dayStart, dayEnd),
  );

  const workOrders = workOrdersRaw
    .filter(
      (wo) =>
        wo.postId != null &&
        wo.scheduledAt != null &&
        WORK_ORDER_STATUSES.has(String(wo.status)) &&
        inDay(wo.scheduledAt, dayStart, dayEnd),
    )
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
      durationMin: b.durationMin ?? 60,
      status: String(b.status),
      href: "/owner/bookings",
      clientName: b.client.name,
      vehicleInfo: b.vehicleInfo ?? "",
      services: [b.serviceName],
    })),
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
    })),
  ];

  return {
    posts,
    blocks,
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
