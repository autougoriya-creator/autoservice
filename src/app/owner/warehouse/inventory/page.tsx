import Link from "next/link";
import {
  inventoryAdjust,
  inventoryAdjustBatch,
} from "@/app/actions/warehouse";
import { prisma } from "@/lib/prisma";
import { formatDateTime, stockMovementLabel } from "@/lib/format";
import { formatQty } from "@/lib/warehouse";
import { toDateInputValue } from "@/lib/schedule-fill";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
import {
  ButtonLink,
  EmptyStub,
  SectionTitle,
  SubmitButton,
} from "@/components/ui";
import {
  DataTable,
  Field,
  FormCard,
  TextInput,
  TextSelect,
  TextTextarea,
  Toolbar,
} from "@/components/forms";

export default async function InventoryPage() {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);

  const [skus, recent] = await Promise.all([
    prisma.fluidSku.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { organizationId, type: "INVENTORY" },
      include: { fluidSku: true, createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const today = toDateInputValue(new Date());

  return (
    <div>
      <SectionTitle
        eyebrow="Склад"
        title="Инвентаризация"
        description="Зафиксируйте фактические остатки в конце периода — система скорректирует учёт."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Активных позиций: {skus.length}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/owner/warehouse/reconcile" variant="ghost">
            Сверка
          </ButtonLink>
          <ButtonLink href="/owner/warehouse" variant="ghost">
            ← К остаткам
          </ButtonLink>
        </div>
      </Toolbar>

      {skus.length === 0 ? (
        <EmptyStub
          title="Нет позиций для пересчёта"
          description="Сначала добавьте техжидкости на склад."
        />
      ) : (
        <div className="space-y-6">
          <FormCard>
            <h2 className="brand-mark mb-1 text-lg">Пересчёт за период</h2>
            <p className="mb-4 text-sm text-[var(--ink-soft)]">
              Укажите факт по нужным позициям (пустые строки пропускаются). После
              фиксации откройте сверку: ожидаемый остаток vs факт.
            </p>
            <form action={inventoryAdjustBatch} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Метка периода"
                  htmlFor="periodLabel"
                  hint="Например даты акта"
                >
                  <TextInput
                    id="periodLabel"
                    name="periodLabel"
                    placeholder={today}
                    defaultValue={today}
                  />
                </Field>
                <Field label="Комментарий" htmlFor="batchNote">
                  <TextInput
                    id="batchNote"
                    name="note"
                    placeholder="Инвентаризация за период"
                    defaultValue="Инвентаризация за период"
                  />
                </Field>
              </div>
              <div className="overflow-x-auto rounded-md border border-[var(--line)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-[var(--ink-soft)]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Позиция</th>
                      <th className="px-3 py-2 font-semibold">Учёт</th>
                      <th className="px-3 py-2 font-semibold">Факт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skus.map((sku) => (
                      <tr key={sku.id} className="border-t border-[var(--line)]">
                        <td className="px-3 py-2 font-medium">
                          <Link
                            href={`/owner/warehouse/${sku.id}`}
                            className="hover:text-[var(--accent)]"
                          >
                            {sku.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-[var(--ink-soft)]">
                          {formatQty(sku.quantityOnHand, sku.unit)}
                        </td>
                        <td className="px-3 py-2">
                          <TextInput
                            name={`counted_${sku.id}`}
                            inputMode="decimal"
                            placeholder={String(sku.quantityOnHand)}
                            aria-label={`Факт ${sku.name}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <SubmitButton>Зафиксировать пересчёт</SubmitButton>
            </form>
          </FormCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <FormCard>
              <h2 className="brand-mark mb-4 text-lg">Одна позиция</h2>
              <form action={inventoryAdjust} className="space-y-4">
                <Field label="Позиция" htmlFor="fluidSkuId">
                  <TextSelect id="fluidSkuId" name="fluidSkuId" required>
                    <option value="">— выберите —</option>
                    {skus.map((sku) => (
                      <option key={sku.id} value={sku.id}>
                        {sku.name} · учёт{" "}
                        {formatQty(sku.quantityOnHand, sku.unit)}
                      </option>
                    ))}
                  </TextSelect>
                </Field>
                <Field
                  label="Фактический остаток"
                  htmlFor="countedQuantity"
                  hint="Сколько реально на полке"
                >
                  <TextInput
                    id="countedQuantity"
                    name="countedQuantity"
                    required
                    inputMode="decimal"
                    placeholder="0"
                  />
                </Field>
                <Field label="Комментарий" htmlFor="note">
                  <TextTextarea
                    id="note"
                    name="note"
                    placeholder="Акт инвентаризации…"
                  />
                </Field>
                <SubmitButton>Зафиксировать</SubmitButton>
              </form>
            </FormCard>

            <FormCard>
              <h2 className="brand-mark mb-4 text-lg">Учётные остатки</h2>
              <ul className="divide-y divide-[var(--line)]">
                {skus.map((sku) => (
                  <li
                    key={sku.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <Link
                      href={`/owner/warehouse/${sku.id}`}
                      className="font-medium hover:text-[var(--accent)]"
                    >
                      {sku.name}
                    </Link>
                    <span className="font-semibold">
                      {formatQty(sku.quantityOnHand, sku.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            </FormCard>
          </div>
        </div>
      )}

      <section className="mt-10">
        <h2 className="brand-mark mb-4 text-xl">Последние инвентаризации</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            Корректировок по инвентаризации ещё не было.
          </p>
        ) : (
          <DataTable headers={["Когда", "Позиция", "Δ", "Факт", "Кто"]}>
            {recent.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 whitespace-nowrap text-[var(--ink-soft)]">
                  {formatDateTime(m.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium">
                  {m.fluidSku.name}
                  <span className="ml-2 text-xs text-[var(--ink-soft)]">
                    {stockMovementLabel[m.type]}
                  </span>
                  {m.note ? (
                    <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                      {m.note}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {m.quantityDelta > 0 ? "+" : ""}
                  {formatQty(m.quantityDelta, m.fluidSku.unit)}
                </td>
                <td className="px-4 py-3">
                  {formatQty(m.quantityAfter, m.fluidSku.unit)}
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {m.createdBy?.name ?? "—"}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
