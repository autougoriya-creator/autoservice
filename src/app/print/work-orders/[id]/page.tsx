import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  formatDateTime,
  formatRub,
  paymentMethodLabel,
  workOrderStatusLabel,
} from "@/lib/format";
import {
  formatDuration,
  workOrderDuration,
  workOrderNumberLabel,
  workOrderTotal,
} from "@/lib/work-order";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { PrintButton } from "@/components/print-button";

export default async function WorkOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const { id } = await params;

  const workOrder = await prisma.workOrder.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      vehicle: true,
      lines: { orderBy: { name: "asc" } },
      organization: true,
    },
  });

  if (!workOrder) notFound();

  const total = workOrderTotal(workOrder.lines);
  const duration = workOrderDuration(workOrder.lines);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/owner/work-orders/${workOrder.id}`}
          className="text-sm font-semibold text-[var(--accent)]"
        >
          ← К заказ-наряду
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-xl border border-[var(--line)] bg-white p-6 sm:p-8 print:border-0 print:p-0">
        <header className="border-b border-[var(--line)] pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Autoservice
          </p>
          <h1 className="brand-mark mt-2 text-3xl">
            Заказ-наряд {workOrderNumberLabel(workOrder.number)}
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {workOrder.organization.name} ·{" "}
            {workOrderStatusLabel[workOrder.status]} ·{" "}
            {formatDateTime(workOrder.createdAt)}
          </p>
        </header>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Клиент
            </h2>
            <p className="mt-2 text-lg font-semibold">{workOrder.customer.name}</p>
            {workOrder.customer.phone ? (
              <p className="text-sm text-[var(--ink-soft)]">
                {workOrder.customer.phone}
              </p>
            ) : null}
            {workOrder.customer.email ? (
              <p className="text-sm text-[var(--ink-soft)]">
                {workOrder.customer.email}
              </p>
            ) : null}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Автомобиль
            </h2>
            <p className="mt-2 text-lg font-semibold">
              {workOrder.vehicle.make} {workOrder.vehicle.model}
            </p>
            <p className="text-sm text-[var(--ink-soft)]">
              {workOrder.vehicle.plate}
              {workOrder.vehicle.year ? ` · ${workOrder.vehicle.year}` : ""}
              {workOrder.vehicle.color ? ` · ${workOrder.vehicle.color}` : ""}
            </p>
            {workOrder.vehicle.vin ? (
              <p className="text-sm text-[var(--ink-soft)]">
                VIN: {workOrder.vehicle.vin}
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Работы / услуги
          </h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.1em] text-[var(--ink-soft)]">
                <th className="py-2 font-semibold">Услуга</th>
                <th className="py-2 font-semibold">Время</th>
                <th className="py-2 text-right font-semibold">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {workOrder.lines.map((line) => (
                <tr key={line.id} className="border-b border-[var(--line)]">
                  <td className="py-3">
                    {line.name}
                    {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                  </td>
                  <td className="py-3 text-[var(--ink-soft)]">
                    {formatDuration(line.durationMin * line.quantity)}
                  </td>
                  <td className="py-3 text-right font-medium">
                    {formatRub(line.priceRub * line.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-[var(--line)] pt-5">
          <div className="text-sm text-[var(--ink-soft)]">
            <p>Общее время: {formatDuration(duration)}</p>
            {workOrder.completedAt ? (
              <p>Закрыт: {formatDate(workOrder.completedAt)}</p>
            ) : null}
            {workOrder.paymentMethod ? (
              <p>
                Оплата: {paymentMethodLabel[workOrder.paymentMethod]}
              </p>
            ) : null}
            {workOrder.notes ? <p className="mt-2">Примечание: {workOrder.notes}</p> : null}
          </div>
          <p className="brand-mark text-3xl">{formatRub(total)}</p>
        </section>

        <footer className="mt-10 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[var(--ink-soft)]">Подпись клиента</p>
            <div className="mt-8 border-b border-[var(--ink)]/40" />
          </div>
          <div>
            <p className="text-xs text-[var(--ink-soft)]">Подпись исполнителя</p>
            <div className="mt-8 border-b border-[var(--ink)]/40" />
          </div>
        </footer>
      </article>
    </div>
  );
}
