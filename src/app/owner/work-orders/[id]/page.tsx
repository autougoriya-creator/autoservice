import Link from "next/link";
import { notFound } from "next/navigation";
import { updateWorkOrderNotes } from "@/app/actions/work-orders";
import { WorkOrderAddLineButton } from "@/components/work-order-add-line-form";
import { WorkOrderStatusForm } from "@/components/work-order-status-form";
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
  workOrderDuration,
  workOrderNumberLabel,
  workOrderTotal,
} from "@/lib/work-order";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { ButtonLink, SectionTitle, StatusPill, SubmitButton } from "@/components/ui";
import {
  Field,
  FormCard,
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
        post: true,
        sourceBooking: true,
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

      <FormCard>
        <h2 className="brand-mark mb-4 text-lg">Сведения о заказ-наряде</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Клиент
            </dt>
            <dd className="mt-1">
              <Link
                href={`/owner/clients/${workOrder.customerId}`}
                className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
              >
                {workOrder.customer.name}
              </Link>
              <p className="text-sm text-[var(--ink-soft)]">
                Телефон (ID): {workOrder.customer.phone}
              </p>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Автомобиль
            </dt>
            <dd className="mt-1">
              <Link
                href={`/owner/vehicles/${workOrder.vehicleId}`}
                className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
              >
                {workOrder.vehicle.make} {workOrder.vehicle.model}
              </Link>
              <p className="text-sm text-[var(--ink-soft)]">
                {workOrder.vehicle.plate}
                {workOrder.vehicle.color ? ` · ${workOrder.vehicle.color}` : ""}
                {" · "}
                {vehicleClassLabel(workOrder.vehicle.vehicleClass)}
              </p>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Пост
            </dt>
            <dd className="mt-1 font-medium text-[var(--ink)]">
              {workOrder.post?.name ?? "Не назначен"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Назначено
            </dt>
            <dd className="mt-1 text-sm text-[var(--ink)]">
              {workOrder.scheduledAt
                ? formatDateTime(workOrder.scheduledAt)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Закрыт
            </dt>
            <dd className="mt-1 text-sm text-[var(--ink)]">
              {workOrder.completedAt
                ? formatDateTime(workOrder.completedAt)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Оплата
            </dt>
            <dd className="mt-1 text-sm text-[var(--ink)]">
              {workOrder.paymentMethod
                ? paymentMethodLabel[workOrder.paymentMethod]
                : "Не указана"}
              {workOrder.paidAt
                ? ` · ${formatDateTime(workOrder.paidAt)}`
                : null}
              {workOrder.paymentMethod === "CASH_AND_TERMINAL" ? (
                <span className="mt-1 block text-[var(--ink-soft)]">
                  Нал в кассу: {formatRub(workOrder.cashPaidRub ?? 0)}
                  {" · "}
                  Терминал: {formatRub(workOrder.terminalPaidRub ?? 0)}
                </span>
              ) : null}
            </dd>
          </div>
          {workOrder.sourceBooking ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                Исходная запись
              </dt>
              <dd className="mt-1 text-sm text-[var(--ink)]">
                <Link
                  href="/owner/desk"
                  className="font-semibold hover:text-[var(--accent)]"
                >
                  С графиком ·{" "}
                  {formatDateTime(workOrder.sourceBooking.startsAt)}
                </Link>
              </dd>
            </div>
          ) : null}
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Комментарий
            </dt>
            <dd className="mt-1 text-sm text-[var(--ink)]">
              {workOrder.notes?.trim() ? workOrder.notes : "—"}
            </dd>
          </div>
        </dl>
      </FormCard>

      <FormCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="brand-mark text-lg">Услуги в заказе</h2>
          {canAddLine ? (
            <WorkOrderAddLineButton
              workOrderId={workOrder.id}
              vehicleClassId={workOrder.vehicle.vehicleClassId}
              services={services}
            />
          ) : null}
        </div>
        {workOrder.lines.length === 0 ? (
          <p className="py-2 text-sm text-[var(--ink-soft)]">
            Услуг пока нет
            {canAddLine ? " — нажмите «Добавить услугу»." : "."}
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
                    {" · "}
                    {formatRub(line.priceRub)} / шт.
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
      </FormCard>

      <div className="grid gap-4 md:grid-cols-2">
        <WorkOrderStatusForm
          workOrderId={workOrder.id}
          status={workOrder.status}
          paymentMethod={workOrder.paymentMethod}
          cashPaidRub={workOrder.cashPaidRub}
          terminalPaidRub={workOrder.terminalPaidRub}
          totalRub={total}
        />

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
