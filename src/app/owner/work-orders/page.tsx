import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime,
  formatRub,
  workOrderStatusLabel,
  workOrderStatusTone,
} from "@/lib/format";
import {
  formatDuration,
  workOrderNumberLabel,
  workOrderTotal,
  workOrderDuration,
} from "@/lib/work-order";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { ButtonLink, EmptyStub, SectionTitle, StatusPill } from "@/components/ui";
import { DataTable, Toolbar } from "@/components/forms";

export default async function WorkOrdersPage() {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);

  const workOrders = await prisma.workOrder.findMany({
    where: { organizationId },
    include: {
      customer: true,
      vehicle: true,
      lines: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div>
      <SectionTitle
        eyebrow="Операции"
        title="Заказ-наряды"
        description="Создавайте заказ-наряд из клиента, авто и услуг. Печать — из карточки документа."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Всего: {workOrders.length}
        </p>
        <ButtonLink href="/owner/work-orders/new">Новый заказ-наряд</ButtonLink>
      </Toolbar>

      {workOrders.length === 0 ? (
        <EmptyStub
          title="Заказ-нарядов нет"
          description="Создайте первый документ на основе справочников."
        />
      ) : (
        <DataTable
          headers={["Номер", "Клиент / авто", "Сумма", "Статус", "Создан", ""]}
        >
          {workOrders.map((wo) => {
            const total = workOrderTotal(wo.lines);
            const duration = workOrderDuration(wo.lines);
            return (
              <tr key={wo.id}>
                <td className="px-4 py-3 font-semibold text-[var(--ink)]">
                  <Link
                    href={`/owner/work-orders/${wo.id}`}
                    className="hover:text-[var(--accent)]"
                  >
                    {workOrderNumberLabel(wo.number)}
                  </Link>
                  <p className="mt-1 text-xs font-normal text-[var(--ink-soft)]">
                    {formatDuration(duration)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--ink)]">{wo.customer.name}</p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {wo.vehicle.make} {wo.vehicle.model} · {wo.vehicle.plate}
                  </p>
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {formatRub(total)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill tone={workOrderStatusTone(wo.status)}>
                    {workOrderStatusLabel[wo.status]}
                  </StatusPill>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[var(--ink-soft)]">
                  {formatDateTime(wo.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/owner/work-orders/${wo.id}`}
                    className="text-sm font-semibold text-[var(--accent)]"
                  >
                    Открыть
                  </Link>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
