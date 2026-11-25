import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime,
  formatRub,
  workOrderStatusLabel,
  workOrderStatusTone,
} from "@/lib/format";
import {
  workOrderNumberLabel,
  workOrderTotal,
} from "@/lib/work-order";
import { OPS_ROLES, isOwner, isStaff } from "@/lib/tenant";
import { SectionTitle, StatusPill } from "@/components/ui";

export default async function OwnerDashboardPage() {
  const session = await requireSession(OPS_ROLES);
  if (isStaff(session)) {
    redirect("/owner/my-work");
  }
  const orgId = session.membership.organization.id;
  const owner = isOwner(session);

  const [
    customersCount,
    servicesCount,
    openWorkOrders,
    fluidSkuCount,
    recentWorkOrders,
  ] = await Promise.all([
    prisma.customer.count({ where: { organizationId: orgId } }),
    prisma.service.count({ where: { organizationId: orgId, isActive: true } }),
    prisma.workOrder.count({
      where: {
        organizationId: orgId,
        status: {
          in: ["NEW", "NEW_FROM_CLIENT", "CONFIRMED", "IN_PROGRESS"],
        },
      },
    }),
    prisma.fluidSku.count({
      where: { organizationId: orgId, isActive: true },
    }),
    prisma.workOrder.findMany({
      where: { organizationId: orgId },
      include: { customer: true, vehicle: true, lines: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div>
      <SectionTitle
        eyebrow="Операции"
        title="Обзор точки"
        description={`Добро пожаловать, ${session.name}. Справочники, заказ-наряды и текущая загрузка.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Клиенты" value={String(customersCount)} href="/owner/clients" />
        <Metric label="Услуги в прайсе" value={String(servicesCount)} href="/owner/services" />
        <Metric
          label="Активные заказ-наряды"
          value={String(openWorkOrders)}
          href="/owner/work-orders"
        />
        <Metric
          label="Склад (SKU)"
          value={String(fluidSkuCount)}
          href="/owner/warehouse"
        />
        <Metric label="Рабочий стол" value="→" href="/owner/desk" />
        {owner ? (
          <Metric label="План выручки" value="→" href="/owner/planned" />
        ) : (
          <Metric label="График смен" value="→" href="/owner/schedule" />
        )}
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="brand-mark text-xl text-[var(--ink)]">Последние заказ-наряды</h2>
          <Link
            href="/owner/work-orders"
            className="text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            Все документы
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white/80">
          {recentWorkOrders.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--ink-soft)]">
              Заказ-нарядов пока нет.{" "}
              <Link href="/owner/work-orders/new" className="font-semibold text-[var(--accent)]">
                Создать
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {recentWorkOrders.map((wo) => (
                <li
                  key={wo.id}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Link
                      href={`/owner/work-orders/${wo.id}`}
                      className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
                    >
                      {workOrderNumberLabel(wo.number)} · {wo.customer.name}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {wo.vehicle.plate} · {formatRub(workOrderTotal(wo.lines))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--ink-soft)]">
                      {formatDateTime(wo.createdAt)}
                    </span>
                    <StatusPill tone={workOrderStatusTone(wo.status)}>
                      {workOrderStatusLabel[wo.status]}
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
