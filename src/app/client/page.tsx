import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime,
  formatRub,
  bookingStatusLabel,
  bookingStatusTone,
  workOrderStatusLabel,
  workOrderStatusTone,
} from "@/lib/format";
import {
  workOrderNumberLabel,
  workOrderTotal,
} from "@/lib/work-order";
import { ButtonLink, SectionTitle, StatusPill } from "@/components/ui";

export default async function ClientCabinetPage({
  searchParams,
}: {
  searchParams: Promise<{ booked?: string }>;
}) {
  const session = await requireSession(["CLIENT"]);
  const orgId = session.membership.organization.id;
  const { booked: justBooked } = await searchParams;

  const customer = await prisma.customer.findFirst({
    where: { organizationId: orgId, userId: session.id },
  });

  const [upcomingRaw, lastWorkOrder, confirmedBooking] = await Promise.all([
    prisma.booking.findMany({
      where: {
        organizationId: orgId,
        clientId: session.id,
        startsAt: { gte: new Date(Date.now() - 60_000) },
        status: { in: ["NEW", "NEW_FROM_CLIENT", "CONFIRMED"] },
        workOrderId: null,
      },
      include: { post: true },
      orderBy: { startsAt: "asc" },
      take: 40,
    }),
    customer
      ? prisma.workOrder.findFirst({
          where: { organizationId: orgId, customerId: customer.id },
          include: { lines: true, vehicle: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
    justBooked
      ? prisma.booking.findFirst({
          where: {
            id: justBooked,
            organizationId: orgId,
            clientId: session.id,
          },
          include: { post: true },
        })
      : Promise.resolve(null),
  ]);

  const upcomingBookings = (() => {
    const list = [...upcomingRaw];
    if (
      confirmedBooking &&
      !list.some((b) => b.id === confirmedBooking.id) &&
      confirmedBooking.workOrderId == null &&
      ["NEW", "NEW_FROM_CLIENT", "CONFIRMED"].includes(confirmedBooking.status)
    ) {
      list.unshift(confirmedBooking);
    }
    if (!justBooked) return list;
    return list.sort((a, b) => {
      if (a.id === justBooked) return -1;
      if (b.id === justBooked) return 1;
      return a.startsAt.getTime() - b.startsAt.getTime();
    });
  })();

  const nextBooking = upcomingRaw[0] ?? null;

  return (
    <div>
      <SectionTitle
        eyebrow="Клиент"
        title={`Здравствуйте, ${session.name.split(" ")[0]}`}
        description={`Личный кабинет в «${session.membership.organization.name}»: запись онлайн, история и блок камер.`}
      />

      {justBooked ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Запись отправлена
          {confirmedBooking
            ? `: ${confirmedBooking.serviceName}, ${formatDateTime(confirmedBooking.startsAt)}`
            : ""}
          . Статус «Новая от клиента» — видно администратору на графике и в
          списке записей.
        </p>
      ) : null}

      <div className="mb-4">
        <ButtonLink href="/client/book">Записаться онлайн</ButtonLink>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-white/85 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Ближайшая запись
          </p>
          {nextBooking ? (
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
                <StatusPill tone={bookingStatusTone(nextBooking.status)}>
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

      <section className="mt-4 rounded-xl border border-[var(--line)] bg-white/85 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Мои записи
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Самозапись и подтверждённые визиты без заказ-наряда.
            </p>
          </div>
          <Link
            href="/client/orders"
            className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            История →
          </Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink-soft)]">
            Пока нет предстоящих записей.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {upcomingBookings.map((booking) => (
              <li
                key={booking.id}
                className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  justBooked === booking.id ? "rounded-lg bg-emerald-50/80 px-2" : ""
                }`}
              >
                <div>
                  <p className="font-semibold text-[var(--ink)]">
                    {booking.serviceName}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
                    {formatDateTime(booking.startsAt)}
                    {booking.post ? ` · ${booking.post.name}` : ""}
                  </p>
                  {booking.vehicleInfo ? (
                    <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                      {booking.vehicleInfo}
                    </p>
                  ) : null}
                </div>
                <StatusPill tone={bookingStatusTone(booking.status)}>
                  {bookingStatusLabel[booking.status]}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </section>

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
