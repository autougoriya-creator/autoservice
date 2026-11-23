import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bookingStatusLabel,
  formatDateTime,
  formatRub,
} from "@/lib/format";
import { isOwner } from "@/lib/tenant";
import { EmptyStub, SectionTitle, StatusPill } from "@/components/ui";

export default async function BookingsStubPage() {
  const session = await requireSession(["OWNER", "ADMIN", "STAFF"]);
  const orgId = session.membership.organization.id;
  const showFinance = isOwner(session);

  const bookings = await prisma.booking.findMany({
    where: { organizationId: orgId },
    include: { client: true, post: true },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div>
      <SectionTitle
        eyebrow="Запись"
        title="Расписание визитов"
        description="Список записей с услугами. Создание и правка — на рабочем столе."
      />

      {bookings.length === 0 ? (
        <EmptyStub
          title="Записей нет"
          description="После появления модуля записи здесь будут слоты и статусы визитов."
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
                    <StatusPill
                      tone={
                        booking.status === "CONFIRMED"
                          ? "ok"
                          : booking.status === "PENDING"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {bookingStatusLabel[booking.status]}
                    </StatusPill>
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
