import Link from "next/link";
import { notFound } from "next/navigation";
import {
  updateWorkOrderNotes,
  updateWorkOrderStatus,
} from "@/app/actions/work-orders";
import { prisma } from "@/lib/prisma";
import {
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
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { ButtonLink, SectionTitle, StatusPill, SubmitButton } from "@/components/ui";
import {
  Field,
  FormCard,
  TextSelect,
  TextTextarea,
} from "@/components/forms";

export default async function WorkOrderDetailPage({
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionTitle
          eyebrow="Заказ-наряд"
          title={workOrderNumberLabel(workOrder.number)}
          description={`${workOrder.organization.name} · создан ${formatDateTime(workOrder.createdAt)}`}
        />
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={workOrderStatusTone(workOrder.status)}>
            {workOrderStatusLabel[workOrder.status]}
          </StatusPill>
          <ButtonLink href={`/print/work-orders/${workOrder.id}`} variant="ghost">
            Печать
          </ButtonLink>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Клиент
          </p>
          <Link
            href={`/owner/clients/${workOrder.customerId}`}
            className="brand-mark mt-2 block text-xl hover:text-[var(--accent)]"
          >
            {workOrder.customer.name}
          </Link>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {workOrder.customer.phone ?? "Телефон не указан"}
          </p>
        </FormCard>
        <FormCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Автомобиль
          </p>
          <Link
            href={`/owner/vehicles/${workOrder.vehicleId}`}
            className="brand-mark mt-2 block text-xl hover:text-[var(--accent)]"
          >
            {workOrder.vehicle.make} {workOrder.vehicle.model}
          </Link>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {workOrder.vehicle.plate}
            {workOrder.vehicle.color ? ` · ${workOrder.vehicle.color}` : ""}
          </p>
        </FormCard>
      </div>

      <FormCard>
        <h2 className="brand-mark mb-4 text-lg">Услуги</h2>
        <ul className="divide-y divide-[var(--line)]">
          {workOrder.lines.map((line) => (
            <li
              key={line.id}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-[var(--ink)]">{line.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {formatDuration(line.durationMin)} × {line.quantity}
                </p>
              </div>
              <p className="font-semibold text-[var(--ink)]">
                {formatRub(line.priceRub * line.quantity)}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-end justify-between border-t border-[var(--line)] pt-4">
          <p className="text-sm text-[var(--ink-soft)]">
            Длительность: {formatDuration(duration)}
          </p>
          <p className="brand-mark text-2xl">{formatRub(total)}</p>
        </div>
      </FormCard>

      <div className="grid gap-4 md:grid-cols-2">
        <FormCard>
          <form action={updateWorkOrderStatus} className="space-y-4">
            <input type="hidden" name="id" value={workOrder.id} />
            <Field label="Статус" htmlFor="status">
              <TextSelect
                id="status"
                name="status"
                defaultValue={workOrder.status}
              >
                {Object.entries(workOrderStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </TextSelect>
            </Field>
            <SubmitButton>Обновить статус</SubmitButton>
          </form>
        </FormCard>

        <FormCard>
          <form action={updateWorkOrderNotes} className="space-y-4">
            <input type="hidden" name="id" value={workOrder.id} />
            <Field label="Комментарий" htmlFor="notes">
              <TextTextarea
                id="notes"
                name="notes"
                defaultValue={workOrder.notes ?? ""}
              />
            </Field>
            <SubmitButton variant="ghost">Сохранить комментарий</SubmitButton>
          </form>
        </FormCard>
      </div>
    </div>
  );
}
