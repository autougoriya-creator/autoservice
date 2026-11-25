import Link from "next/link";
import { notFound } from "next/navigation";
import {
  updateWorkOrderNotes,
  updateWorkOrderStatus,
} from "@/app/actions/work-orders";
import { WorkOrderAddLineForm } from "@/components/work-order-add-line-form";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime,
  formatRub,
  paymentMethodLabel,
  workOrderStatusLabel,
  workOrderStatusTone,
} from "@/lib/format";
import { vehicleClassLabel } from "@/lib/pricing";
import {
  formatDuration,
  selectableWorkOrderStatuses,
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

  const [workOrder, services] = await Promise.all([
    prisma.workOrder.findFirst({
      where: { id, organizationId },
      include: {
        customer: true,
        vehicle: { include: { vehicleClass: true } },
        lines: { orderBy: { name: "asc" } },
        organization: true,
      },
    }),
    prisma.service.findMany({
      where: { organizationId, isActive: true },
      include: { classPrices: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!workOrder) notFound();

  const total = workOrderTotal(workOrder.lines);
  const duration = workOrderDuration(workOrder.lines);
  const canAddLine = workOrder.status !== "CLOSED";
  const statusOptions = selectableWorkOrderStatuses(workOrder.status);
  const roleLabel =
    session.membership.role === "STAFF"
      ? "Мойщик / сотрудник"
      : session.membership.role === "ADMIN"
        ? "Администратор"
        : "Владелец";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionTitle
          eyebrow="Заказ-наряд"
          title={workOrderNumberLabel(workOrder.number)}
          description={`${workOrder.organization.name} · создан ${formatDateTime(workOrder.createdAt)} · общий вид для админа и мойщика (${roleLabel})`}
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
            Телефон (ID): {workOrder.customer.phone}
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
            {" · "}
            {vehicleClassLabel(workOrder.vehicle.vehicleClass)}
          </p>
        </FormCard>
      </div>

      <FormCard>
        <h2 className="brand-mark mb-4 text-lg">Услуги</h2>
        {workOrder.lines.length === 0 ? (
          <p className="py-2 text-sm text-[var(--ink-soft)]">
            Услуг пока нет — добавьте строку ниже.
          </p>
        ) : (
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
        )}
        <div className="mt-4 flex items-end justify-between border-t border-[var(--line)] pt-4">
          <p className="text-sm text-[var(--ink-soft)]">
            Длительность: {formatDuration(duration)}
          </p>
          <p className="brand-mark text-2xl">{formatRub(total)}</p>
        </div>
        {workOrder.paymentMethod ? (
          <p className="mt-3 text-sm text-[var(--ink-soft)]">
            Оплата: {paymentMethodLabel[workOrder.paymentMethod]}
            {workOrder.paidAt
              ? ` · ${formatDateTime(workOrder.paidAt)}`
              : null}
          </p>
        ) : null}
      </FormCard>

      {canAddLine ? (
        <WorkOrderAddLineForm
          workOrderId={workOrder.id}
          vehicleClassId={workOrder.vehicle.vehicleClassId}
          services={services}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <FormCard>
          <form action={updateWorkOrderStatus} className="space-y-4">
            <input type="hidden" name="id" value={workOrder.id} />
            <Field
              label="Статус"
              htmlFor="status"
              hint="Заказ-наряд: в работе → закрыт (статусы записи живут отдельно)"
            >
              <TextSelect
                id="status"
                name="status"
                defaultValue={workOrder.status}
                disabled={statusOptions.length <= 1}
              >
                {statusOptions.map((value) => (
                  <option key={value} value={value}>
                    {workOrderStatusLabel[value]}
                  </option>
                ))}
              </TextSelect>
            </Field>
            <Field label="Вид оплаты (для закрытия)" htmlFor="paymentMethod">
              <TextSelect
                id="paymentMethod"
                name="paymentMethod"
                defaultValue={workOrder.paymentMethod ?? ""}
              >
                <option value="">— выберите при закрытии —</option>
                {Object.entries(paymentMethodLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </TextSelect>
            </Field>
            <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                name="writeOffByNorms"
                value="1"
                defaultChecked
                className="mt-1"
              />
              <span>
                При закрытии списать техжидкости по нормам услуг
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  Если у услуг заданы нормы расхода на складе.
                </span>
              </span>
            </label>
            <p className="text-xs text-[var(--ink-soft)]">
              Закрытие заказ-наряда возможно только из статуса «В работе» и с
              указанием вида оплаты. Администратор проверяет состав услуг при
              проведении.
            </p>
            {statusOptions.length > 1 ? (
              <SubmitButton>Обновить статус</SubmitButton>
            ) : (
              <p className="text-sm text-[var(--ink-soft)]">
                Дальнейших переходов нет — заказ закрыт.
              </p>
            )}
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
