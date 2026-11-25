import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteFluidSku, updateFluidSku } from "@/app/actions/warehouse";
import { prisma } from "@/lib/prisma";
import { formatDateTime, stockMovementLabel } from "@/lib/format";
import { formatQty } from "@/lib/warehouse";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
import { SectionTitle, SubmitButton } from "@/components/ui";
import {
  DataTable,
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
} from "@/components/forms";

export default async function FluidSkuDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const { id } = await params;

  const sku = await prisma.fluidSku.findFirst({
    where: { id, organizationId },
    include: {
      movements: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { createdBy: true, workOrder: true },
      },
      serviceNorms: {
        include: { service: true },
        orderBy: { service: { name: "asc" } },
      },
    },
  });
  if (!sku) notFound();

  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Склад"
        title={sku.name}
        description={`Остаток: ${formatQty(sku.quantityOnHand, sku.unit)}`}
      />

      <FormCard className="max-w-xl">
        <form action={updateFluidSku} className="space-y-4">
          <input type="hidden" name="id" value={sku.id} />
          <Field label="Название" htmlFor="name">
            <TextInput id="name" name="name" required defaultValue={sku.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Единица" htmlFor="unit">
              <TextSelect id="unit" name="unit" defaultValue={sku.unit}>
                <option value="л">л</option>
                <option value="мл">мл</option>
                <option value="шт">шт</option>
                <option value="кг">кг</option>
              </TextSelect>
            </Field>
            <Field label="Код / артикул" htmlFor="skuCode">
              <TextInput
                id="skuCode"
                name="skuCode"
                defaultValue={sku.skuCode ?? ""}
              />
            </Field>
          </div>
          <Field label="Статус" htmlFor="isActive">
            <TextSelect
              id="isActive"
              name="isActive"
              defaultValue={sku.isActive ? "1" : "0"}
            >
              <option value="1">В учёте</option>
              <option value="0">Скрыта</option>
            </TextSelect>
          </Field>
          <FormActions>
            <SubmitButton className="sm:w-auto">Сохранить</SubmitButton>
          </FormActions>
        </form>
      </FormCard>

      {sku.serviceNorms.length > 0 ? (
        <FormCard>
          <h2 className="brand-mark mb-3 text-lg">Нормы в услугах</h2>
          <ul className="divide-y divide-[var(--line)]">
            {sku.serviceNorms.map((norm) => (
              <li
                key={norm.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <Link
                  href={`/owner/services/${norm.serviceId}`}
                  className="font-medium hover:text-[var(--accent)]"
                >
                  {norm.service.name}
                </Link>
                <span className="text-sm text-[var(--ink-soft)]">
                  {formatQty(norm.quantityPerUnit, sku.unit)} / усл.
                </span>
              </li>
            ))}
          </ul>
        </FormCard>
      ) : null}

      <section>
        <h2 className="brand-mark mb-4 text-xl">Движения</h2>
        {sku.movements.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Движений ещё нет.</p>
        ) : (
          <DataTable headers={["Когда", "Тип", "Δ", "Остаток", "Комментарий"]}>
            {sku.movements.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 whitespace-nowrap text-[var(--ink-soft)]">
                  {formatDateTime(m.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {stockMovementLabel[m.type] ?? m.type}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {m.quantityDelta > 0 ? "+" : ""}
                  {formatQty(m.quantityDelta, sku.unit)}
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {formatQty(m.quantityAfter, sku.unit)}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--ink-soft)]">
                  {m.note ?? "—"}
                  {m.workOrder
                    ? ` · ЗН-${String(m.workOrder.number).padStart(4, "0")}`
                    : ""}
                  {m.createdBy ? ` · ${m.createdBy.name}` : ""}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <form action={deleteFluidSku}>
        <input type="hidden" name="id" value={sku.id} />
        <button
          type="submit"
          className="cursor-pointer text-sm font-semibold text-red-700 hover:underline"
        >
          Удалить позицию
        </button>
      </form>
    </div>
  );
}
