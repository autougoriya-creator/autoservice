import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime,
  formatRub,
  bookingStatusLabel,
  workOrderStatusLabel,
  workOrderStatusTone,
} from "@/lib/format";
import {
  workOrderNumberLabel,
  workOrderTotal,
} from "@/lib/work-order";
import { ButtonLink, SectionTitle, StatusPill } from "@/components/ui";

export default async function ClientCabinetPage() {
  const session = await requireSession(["CLIENT"]);
  const orgId = session.membership.organization.id;

  const customer = await prisma.customer.findFirst({
    where: { organizationId: orgId, userId: session.id },
  });

  const [nextBooking, nextClientOrder, lastWorkOrder] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        organizationId: orgId,
        clientId: session.id,
        startsAt: { gte: new Date() },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      include: { post: true },
      orderBy: { startsAt: "asc" },
    }),
    customer
      ? prisma.workOrder.findFirst({
          where: {
            organizationId: orgId,
            customerId: customer.id,
            scheduledAt: { gte: new Date() },
            status: {
              in: ["NEW_FROM_CLIENT", "NEW", "CONFIRMED"],
            },
          },
          include: { lines: true, vehicle: true, post: true },
          orderBy: { scheduledAt: "asc" },
        })
      : Promise.resolve(null),
    customer
      ? prisma.workOrder.findFirst({
          where: { organizationId: orgId, customerId: customer.id },
          include: { lines: true, vehicle: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  const upcomingFromSelf =
    nextClientOrder &&
    (!nextBooking ||
      (nextClientOrder.scheduledAt &&
        nextClientOrder.scheduledAt <= nextBooking.startsAt))
      ? nextClientOrder
      : null;

  return (
    <div>
      <SectionTitle
        eyebrow="Клиент"
        title={`Здравствуйте, ${session.name.split(" ")[0]}`}
        description={`Личный кабинет в «${session.membership.organization.name}»: запись онлайн, история и блок камер.`}
      />

      <div className="mb-4">
        <ButtonLink href="/client/book">Записаться онлайн</ButtonLink>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-white/85 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Ближайшая запись
          </p>
          {upcomingFromSelf ? (
            <div className="mt-4">
              <p className="brand-mark text-2xl text-[var(--ink)]">
                {upcomingFromSelf.lines.map((l) => l.name).join(", ")}
              </p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                {upcomingFromSelf.scheduledAt
                  ? formatDateTime(upcomingFromSelf.scheduledAt)
                  : ""}
                {upcomingFromSelf.post
                  ? ` · ${upcomingFromSelf.post.name}`
                  : ""}
              </p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                {upcomingFromSelf.vehicle.make} {upcomingFromSelf.vehicle.model}{" "}
                · {upcomingFromSelf.vehicle.plate}
              </p>
              <div className="mt-4">
                <StatusPill tone={workOrderStatusTone(upcomingFromSelf.status)}>
                  {workOrderStatusLabel[upcomingFromSelf.status]}
                </StatusPill>
              </div>
            </div>
          ) : nextBooking ? (
            <div className="mt-4">
              <p className="brand-mark text-2xl text-[var(--ink)]">
                {nextBooking.serviceName}
              </p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                {formatDateTime(nextBooking.startsAt)}
                {nextBooking.post ? ` · ${nextBooking.post.name}` : ""}
              </p>
              {nextBooking.vehicleInfo ? (
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {nextBooking.vehicleInfo}
                </p>
              ) : null}
              <div className="mt-4">
                <StatusPill tone="ok">
                  {bookingStatusLabel[nextBooking.status]}
                </StatusPill>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-[var(--ink-soft)]">
                Активных записей нет.
              </p>
              <Link
                href="/client/book"
                className="mt-3 inline-block text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-deep)]"
              >
                Записаться онлайн →
              </Link>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-white/85 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Последний заказ-наряд
          </p>
          {lastWorkOrder ? (
            <div className="mt-4">
              <p className="brand-mark text-2xl text-[var(--ink)]">
                {workOrderNumberLabel(lastWorkOrder.number)}
              </p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                {lastWorkOrder.lines.map((l) => l.name).join(", ")}
              </p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                {formatRub(workOrderTotal(lastWorkOrder.lines))} ·{" "}
                {lastWorkOrder.vehicle.plate}
              </p>
              <div className="mt-3">
                <StatusPill tone={workOrderStatusTone(lastWorkOrder.status)}>
                  {workOrderStatusLabel[lastWorkOrder.status]}
                </StatusPill>
              </div>
              <Link
                href="/client/orders"
                className="mt-4 inline-block text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-deep)]"
              >
                Вся история
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--ink-soft)]">Заказов пока нет.</p>
          )}
        </section>
      </div>

      <Link
        href="/client/cameras"
        className="mt-4 flex items-center justify-between rounded-xl border border-[var(--line)] bg-[linear-gradient(135deg,#14212b_0%,#1a6b5c_100%)] p-6 text-white transition hover:opacity-95"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Зона обслуживания
          </p>
          <p className="brand-mark mt-2 text-2xl">Камеры · скоро live</p>
          <p className="mt-2 max-w-md text-sm text-white/70">
            Место под трансляцию уже заложено в кабинете. Поток подключим
            отдельно.
          </p>
        </div>
        <span className="hidden text-sm font-semibold sm:inline">Открыть →</span>
      </Link>
    </div>
  );
}
