import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  formatDateTime,
  formatRub,
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

  const workOrders = customer
    ? await prisma.workOrder.findMany({
        where: { organizationId: orgId, customerId: customer.id },
        include: { vehicle: true, lines: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div>
      <SectionTitle
        eyebrow="История"
        title="Заказы"
        description="Ваши заказ-наряды в этой точке. Готовые и текущие работы."
      />

      {justCreated ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Заявка отправлена со статусом «Новый от клиента». Администратор
          подтвердит запись.
        </p>
      ) : null}

      <div className="mb-4">
        <ButtonLink href="/client/book" variant="ghost">
          Новая запись
        </ButtonLink>
      </div>

      {workOrders.length === 0 ? (
        <EmptyStub
          title="История пуста"
          description="Когда появятся заказ-наряды, привязанные к вашему аккаунту, они отобразятся здесь."
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
    </div>
  );
}
