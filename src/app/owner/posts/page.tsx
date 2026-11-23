import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, bookingStatusLabel } from "@/lib/format";
import { SectionTitle, StatusPill } from "@/components/ui";

export default async function PostsBoardPage() {
  const session = await requireSession(["OWNER", "ADMIN", "STAFF"]);
  const orgId = session.membership.organization.id;

  const posts = await prisma.servicePost.findMany({
    where: { organizationId: orgId },
    include: {
      bookings: {
        where: {
          status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
          startsAt: {
            gte: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
        },
        include: { client: true },
        orderBy: { startsAt: "asc" },
        take: 3,
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div>
      <SectionTitle
        eyebrow="Посты"
        title="Посты точки"
        description="Список боксов. Полная загрузка по часам — на «Рабочем столе»."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {posts.map((post) => {
          const busy = post.bookings.some((b) => b.status === "IN_PROGRESS");
          const upcoming = post.bookings[0];

          return (
            <article
              key={post.id}
              className="flex flex-col rounded-xl border border-[var(--line)] bg-white/85 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="brand-mark text-lg text-[var(--ink)]">
                    {post.name}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    Порядок: {post.sortOrder}
                  </p>
                </div>
                <StatusPill tone={busy ? "accent" : upcoming ? "warn" : "ok"}>
                  {busy ? "Занят" : upcoming ? "Ожидает" : "Свободен"}
                </StatusPill>
              </div>

              <div className="mt-5 flex-1 space-y-3">
                {post.bookings.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--ink-soft)]">
                    Нет ближайших записей
                  </p>
                ) : (
                  post.bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-lg bg-[var(--paper)] px-3 py-3"
                    >
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {booking.serviceName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">
                        {booking.client.name} · {formatDateTime(booking.startsAt)}
                      </p>
                      <p className="mt-2 text-xs font-medium text-[var(--teal)]">
                        {bookingStatusLabel[booking.status]}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
