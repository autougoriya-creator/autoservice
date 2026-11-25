import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCustomer, updateCustomer } from "@/app/actions/directories";
import { prisma } from "@/lib/prisma";
import { workOrderStatusLabel } from "@/lib/format";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { ButtonLink, SectionTitle, SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextTextarea,
} from "@/components/forms";

export default async function ClientEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const { id } = await params;

  const client = await prisma.customer.findFirst({
    where: { id, organizationId },
    include: {
      vehicles: { orderBy: { plate: "asc" } },
      workOrders: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { vehicle: true },
      },
    },
  });

  if (!client) notFound();

  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Справочник"
        title={client.name}
        description={`ID клиента: ${client.phone}. Контакты, автомобили и недавние заказ-наряды.`}
      />

      <FormCard>
        <form action={updateCustomer} className="space-y-4">
          <input type="hidden" name="id" value={client.id} />
          <Field label="Имя" htmlFor="name">
            <TextInput id="name" name="name" required defaultValue={client.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Телефон (ID клиента)" htmlFor="phone">
              <TextInput
                id="phone"
                name="phone"
                type="tel"
                required
                defaultValue={client.phone}
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <TextInput
                id="email"
                name="email"
                type="email"
                defaultValue={client.email ?? ""}
              />
            </Field>
          </div>
          <Field label="Заметки" htmlFor="notes">
            <TextTextarea
              id="notes"
              name="notes"
              defaultValue={client.notes ?? ""}
            />
          </Field>
          <FormActions>
            <SubmitButton className="sm:w-auto">Сохранить изменения</SubmitButton>
          </FormActions>
        </form>
      </FormCard>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="brand-mark text-xl">Автомобили</h2>
          <ButtonLink href={`/owner/vehicles/new?customerId=${client.id}`}>
            Добавить авто
          </ButtonLink>
        </div>
        {client.vehicles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/60 px-4 py-6 text-sm text-[var(--ink-soft)]">
            Автомобилей нет.
          </p>
        ) : (
          <ul className="space-y-2">
            {client.vehicles.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/owner/vehicles/${v.id}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-white/85 px-4 py-3 hover:border-[var(--ink)]/25"
                >
                  <span className="font-medium">
                    {v.make} {v.model}
                  </span>
                  <span className="text-sm text-[var(--ink-soft)]">{v.plate}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="brand-mark text-xl">Недавние заказ-наряды</h2>
          <ButtonLink
            href={`/owner/work-orders/new?customerId=${client.id}`}
            variant="ghost"
          >
            Новый заказ-наряд
          </ButtonLink>
        </div>
        {client.workOrders.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Пока пусто.</p>
        ) : (
          <ul className="space-y-2">
            {client.workOrders.map((wo) => (
              <li key={wo.id}>
                <Link
                  href={`/owner/work-orders/${wo.id}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-white/85 px-4 py-3"
                >
                  <span>
                    ЗН-{String(wo.number).padStart(4, "0")} · {wo.vehicle.plate}
                  </span>
                  <span className="text-sm text-[var(--ink-soft)]">
                    {workOrderStatusLabel[wo.status] ?? wo.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={deleteCustomer}>
        <input type="hidden" name="id" value={client.id} />
        <button
          type="submit"
          className="cursor-pointer text-sm font-semibold text-red-700 hover:underline"
        >
          Удалить клиента
        </button>
      </form>
    </div>
  );
}
