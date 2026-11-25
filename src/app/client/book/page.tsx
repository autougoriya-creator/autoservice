import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workOrderDuration } from "@/lib/work-order";
import { ClientBookingForm } from "@/components/client-booking-form";
import { EmptyStub, SectionTitle } from "@/components/ui";

export default async function ClientBookPage() {
  const session = await requireSession(["CLIENT"]);
  const orgId = session.membership.organization.id;

  const customer = await prisma.customer.findFirst({
    where: { organizationId: orgId, userId: session.id },
    include: {
      vehicles: {
        include: { vehicleClass: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!customer) {
    return (
      <div>
        <SectionTitle
          eyebrow="Запись"
          title="Онлайн-запись"
          description="Выберите услугу, автомобиль и удобное время."
        />
        <EmptyStub
          title="Профиль не найден"
          description="Ваш аккаунт не привязан к карточке клиента. Обратитесь к администратору точки."
        />
      </div>
    );
  }

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 8);

  const [services, posts, bookings, workOrders] = await Promise.all([
    prisma.service.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { classPrices: true },
      orderBy: { name: "asc" },
    }),
    prisma.servicePost.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: new Date(), lte: horizon },
      },
      select: {
        startsAt: true,
        durationMin: true,
        postId: true,
        status: true,
      },
    }),
    prisma.workOrder.findMany({
      where: { organizationId: orgId },
      include: { lines: true },
    }),
  ]);

  const bookingBusyStatuses = new Set([
    "PENDING",
    "CONFIRMED",
    "IN_PROGRESS",
  ]);
  const woBusyStatuses = new Set([
    "NEW",
    "NEW_FROM_CLIENT",
    "CONFIRMED",
    "IN_PROGRESS",
  ]);

  const busy = [
    ...bookings
      .filter(
        (b) =>
          b.postId != null &&
          bookingBusyStatuses.has(String(b.status)),
      )
      .map((b) => ({
        startsAtIso: b.startsAt.toISOString(),
        durationMin: b.durationMin,
        postId: b.postId as string,
      })),
    ...workOrders
      .filter(
        (wo) =>
          wo.postId != null &&
          wo.scheduledAt != null &&
          wo.scheduledAt >= new Date() &&
          wo.scheduledAt <= horizon &&
          woBusyStatuses.has(String(wo.status)),
      )
      .map((wo) => ({
        startsAtIso: (wo.scheduledAt as Date).toISOString(),
        durationMin: Math.max(15, workOrderDuration(wo.lines)),
        postId: wo.postId as string,
      })),
  ];

  return (
    <div>
      <SectionTitle
        eyebrow="Запись"
        title="Онлайн-запись"
        description="Выберите услугу, автомобиль и свободный слот. Заявка придёт со статусом «Новый от клиента»."
      />

      <ClientBookingForm
        phone={customer.phone}
        vehicles={customer.vehicles.map((v) => ({
          id: v.id,
          make: v.make,
          model: v.model,
          plate: v.plate,
          vehicleClassId: v.vehicleClassId,
          vehicleClass: v.vehicleClass
            ? { code: v.vehicleClass.code, name: v.vehicleClass.name }
            : null,
        }))}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          priceRub: s.priceRub,
          durationMin: s.durationMin,
          classPrices: s.classPrices.map((p) => ({
            vehicleClassId: p.vehicleClassId,
            priceRub: p.priceRub,
          })),
        }))}
        posts={posts.map((p) => ({
          id: p.id,
          name: p.name,
          workStartHour: p.workStartHour,
          workEndHour: p.workEndHour,
        }))}
        busy={busy}
      />
    </div>
  );
}
