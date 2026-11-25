import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  formatDateTime,
  formatRub,
  bookingStatusLabel,
  bookingStatusTone,
  workOrderStatusLabel,
  workOrderStatusTone,
} from "@/lib/format";
import {
  formatDuration,
  workOrderDuration,
  workOrderNumberLabel,
  workOrderTotal,
} from "@/lib/work-order";
import { ButtonLink, EmptyStub, SectionTitle, StatusPill } from "@/components/ui";

export default async function ClientOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await requireSession(["CLIENT"]);
  const orgId = session.membership.organization.id;
  const { created: justCreated } = await searchParams;

  const customer = await prisma.customer.findFirst({
    where: { organizationId: orgId, userId: session.id },
  });

  const [bookings, workOrders] = await Promise.all([
    prisma.booking.findMany({
      where: {
        organizationId: orgId,
        clientId: session.id,
      },
      include: { post: true },
      orderBy: { startsAt: "desc" },
      take: 40,
    }),
    customer
      ? prisma.workOrder.findMany({
          where: { organizationId: orgId, customerId: customer.id },
          include: { vehicle: true, lines: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const nowMs = Date.now() - 60_000;
  const activeBookings = bookings.filter(
    (b) =>
      b.workOrderId == null &&
      b.startsAt.getTime() >= nowMs &&
      (b.status === "NEW" ||
        b.status === "NEW_FROM_CLIENT" ||
        b.status === "CONFIRMED"),
  );
  const activeIds = new Set(activeBookings.map((b) => b.id));
  const pastBookings = bookings.filter((b) => !activeIds.has(b.id));

  return (
    <div>
      <SectionTitle
        eyebrow="История"
        title="Записи и заказы"
        description="Самозапись и заказ-наряды в этой точке."
      />

      {justCreated ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Заявка отправлена. Администратор подтвердит запись.
        </p>
      ) : null}

      <div className="mb-4">
        <ButtonLink href="/client/book" variant="ghost">
          Новая запись
        </ButtonLink>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          Активные записи
        </h2>
        {activeBookings.length === 0 ? (
          <EmptyStub
            title="Нет активных записей"
            description="Запишитесь онлайн — заявка появится здесь со статусом «Новая от клиента»."
          />
        ) : (
          <ul className="space-y-3">
            {activeBookings.map((booking) => (
              <li
                key={booking.id}
                className="rounded-xl border border-[var(--line)] bg-white/85 px-5 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-[var(--ink)]">
                      {booking.serviceName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {formatDateTime(booking.startsAt)}
                      {booking.post ? ` · ${booking.post.name}` : ""}
                    </p>
                    {booking.vehicleInfo ? (
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        {booking.vehicleInfo}
                      </p>
                    ) : null}
                  </div>
                  <StatusPill tone={bookingStatusTone(booking.status)}>
                    {bookingStatusLabel[booking.status]}
                  </StatusPill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          Заказ-наряды
        </h2>
        {workOrders.length === 0 ? (
          <EmptyStub
            title="Заказ-нарядов пока нет"
            description="Когда вы приедете, администратор создаст заказ-наряд из записи."
          />
        ) : (
          <ul className="space-y-3">
            {workOrders.map((wo) => {
              const total = workOrderTotal(wo.lines);
              const duration = workOrderDuration(wo.lines);
              return (
                <li
                  key={wo.id}
                  className="rounded-xl border border-[var(--line)] bg-white/85 px-5 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-[var(--ink)]">
                        {workOrderNumberLabel(wo.number)} ·{" "}
                        {wo.lines.map((l) => l.name).join(", ")}
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        {wo.vehicle.make} {wo.vehicle.model} · {wo.vehicle.plate}
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        {wo.scheduledAt
                          ? `Запись: ${formatDateTime(wo.scheduledAt)}`
                          : formatDate(wo.completedAt ?? wo.createdAt)}
                        {" · "}
                        {formatDuration(duration)}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <p className="brand-mark text-lg text-[var(--ink)]">
                        {formatRub(total)}
                      </p>
                      <StatusPill tone={workOrderStatusTone(wo.status)}>
                        {workOrderStatusLabel[wo.status]}
                      </StatusPill>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pastBookings.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            Прошлые и отменённые записи
          </h2>
          <ul className="space-y-2">
            {pastBookings.slice(0, 15).map((booking) => (
              <li
                key={booking.id}
                className="rounded-lg border border-[var(--line)] bg-white/60 px-4 py-3 text-sm"
              >
                <span className="font-medium text-[var(--ink)]">
                  {booking.serviceName}
                </span>
                <span className="text-[var(--ink-soft)]">
                  {" · "}
                  {formatDateTime(booking.startsAt)}
                </span>
                <span className="ml-2 inline-block align-middle">
                  <StatusPill tone={bookingStatusTone(booking.status)}>
                    {bookingStatusLabel[booking.status]}
                  </StatusPill>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
