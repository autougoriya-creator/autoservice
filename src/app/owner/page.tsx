import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, bookingStatusLabel } from "@/lib/format";
import { SectionTitle, StatusPill } from "@/components/ui";

export default async function OwnerDashboardPage() {
  const session = await requireSession(["OWNER", "STAFF"]);
  const orgId = session.membership.organization.id;

  const [postsCount, bookingsToday, recentBookings, clientsCount] =
    await Promise.all([
      prisma.servicePost.count({
        where: { organizationId: orgId, isActive: true },
      }),
      prisma.booking.count({
        where: {
          organizationId: orgId,
          startsAt: {
            gte: startOfDay(new Date()),
            lt: endOfDay(new Date()),
          },
        },
      }),
      prisma.booking.findMany({
        where: { organizationId: orgId },
        include: { client: true, post: true },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      prisma.membership.count({
        where: { organizationId: orgId, role: "CLIENT" },
      }),
    ]);

  return (
    <div>
      <SectionTitle
        eyebrow="Операции"
        title="Обзор точки"
        description={`Добро пожаловать, ${session.name}. Здесь будет сводка по загрузке, записи и клиентам.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Активные посты"
          value={String(postsCount)}
          href="/owner/posts"
        />
        <Metric
          label="Записи на сегодня"
          value={String(bookingsToday)}
          href="/owner/bookings"
        />
        <Metric label="Клиенты тенанта" value={String(clientsCount)} />
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="brand-mark text-xl text-[var(--ink)]">Ближайшая запись</h2>
          <Link
            href="/owner/bookings"
            className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            Вся запись
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white/80">
          {recentBookings.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--ink-soft)]">
              Записей пока нет.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {recentBookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-[var(--ink)]">
                      {booking.serviceName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {booking.client.name}
                      {booking.vehicleInfo ? ` · ${booking.vehicleInfo}` : ""}
                      {booking.post ? ` · ${booking.post.name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--ink-soft)]">
                      {formatDateTime(booking.startsAt)}
                    </span>
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
        {label}
      </p>
      <p className="brand-mark mt-3 text-3xl text-[var(--ink)]">{value}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-xl border border-[var(--line)] bg-white/80 p-5 transition hover:border-[var(--ink)]/25 hover:shadow-[var(--shadow)]"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/80 p-5">
      {content}
    </div>
  );
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
