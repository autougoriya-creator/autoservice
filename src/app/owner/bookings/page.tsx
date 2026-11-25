import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBookingOutcomeSummary } from "@/lib/booking-analytics";
import {
  bookingStatusLabel,
  bookingStatusTone,
  formatDateTime,
  formatRub,
  workOrderStatusLabel,
} from "@/lib/format";
import { workOrderNumberLabel } from "@/lib/work-order";
import { isOwner } from "@/lib/tenant";
import { EmptyStub, SectionTitle, StatusPill } from "@/components/ui";

export default async function BookingsPage() {
  const session = await requireSession(["OWNER", "ADMIN", "STAFF"]);
  const orgId = session.membership.organization.id;
  const showFinance = isOwner(session);
  const showAnalytics = isOwner(session);

  const [bookings, analytics] = await Promise.all([
    prisma.booking.findMany({
      where: { organizationId: orgId },
      include: {
        client: true,
        post: true,
        workOrder: { select: { id: true, number: true, status: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 80,
    }),
    showAnalytics
      ? buildBookingOutcomeSummary(orgId, "week")
      : Promise.resolve(null),
  ]);

  return (
    <div>
      <SectionTitle
        eyebrow="Запись"
        title="Расписание визитов"
        description="Запись и заказ-наряд разделены: сначала запись, ЗН — когда клиент приехал. Создание и правка — на рабочем столе."
      />

      {analytics ? (
        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Записей за неделю"
            value={String(analytics.total)}
          />
          <Metric
            label="Закрыты через ЗН"
            value={String(analytics.closedViaWorkOrderCount)}
            hint="Запись → ЗН → закрыт"
          />
          <Metric
            label="Отменено"
            value={String(analytics.cancelledCount)}
          />
          <Metric
            label="Ещё открыты"
            value={String(analytics.openCount)}
            hint={`С ЗН в работе: ${analytics.withWorkOrderCount - analytics.closedViaWorkOrderCount}`}
          />
          {analytics.cancelReasons.length > 0 ? (
            <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-[var(--line)] bg-white/85 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                Причины отмен
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--ink)]">
                {analytics.cancelReasons.map((r) => (
                  <li key={r.reason}>
                    {r.reason}{" "}
                    <span className="text-[var(--ink-soft)]">×{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {bookings.length === 0 ? (
        <EmptyStub
          title="Записей нет"
          description="Создайте запись на рабочем столе или дождитесь самозаписи клиента."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white/85">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--paper)]/80 text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Когда</th>
                <th className="px-4 py-3 font-semibold">Услуга</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                  Клиент
                </th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">
                  Пост
                </th>
                {showFinance ? (
                  <th className="px-4 py-3 font-semibold">План</th>
                ) : null}
                <th className="px-4 py-3 font-semibold">Статус</th>
                <th className="px-4 py-3 font-semibold">ЗН</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {bookings.map((booking) => (
                <tr key={booking.id} className="align-top">
                  <td className="px-4 py-4 whitespace-nowrap text-[var(--ink)]">
                    {formatDateTime(booking.startsAt)}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-[var(--ink)]">
                      {booking.serviceName}
                    </p>
                    {booking.vehicleInfo ? (
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">
                        {booking.vehicleInfo}
                      </p>
                    ) : null}
                    {booking.status === "CANCELLED" && booking.cancelReason ? (
                      <p className="mt-1 text-xs text-[var(--accent-deep)]">
                        Причина: {booking.cancelReason}
                      </p>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-4 text-[var(--ink-soft)] sm:table-cell">
                    {booking.client.name}
                  </td>
                  <td className="hidden px-4 py-4 text-[var(--ink-soft)] md:table-cell">
                    {booking.post?.name ?? "—"}
                  </td>
                  {showFinance ? (
                    <td className="px-4 py-4 font-medium">
                      {formatRub(booking.plannedAmountRub)}
                    </td>
                  ) : null}
                  <td className="px-4 py-4">
                    <StatusPill tone={bookingStatusTone(booking.status)}>
                      {bookingStatusLabel[booking.status]}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-4">
                    {booking.workOrder ? (
                      <Link
                        href={`/owner/work-orders/${booking.workOrder.id}`}
                        className="font-semibold text-[var(--accent)] hover:text-[var(--accent-deep)]"
                      >
                        {workOrderNumberLabel(booking.workOrder.number)}
                        <span className="mt-0.5 block text-xs font-normal text-[var(--ink-soft)]">
                          {workOrderStatusLabel[booking.workOrder.status]}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-[var(--ink-soft)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/85 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
        {label}
      </p>
      <p className="brand-mark mt-2 text-3xl text-[var(--ink)]">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--ink-soft)]">{hint}</p>
      ) : null}
    </div>
  );
}
