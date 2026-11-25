import Link from "next/link";
import { inventoryAdjust } from "@/app/actions/warehouse";
import { prisma } from "@/lib/prisma";
import { formatDateTime, stockMovementLabel } from "@/lib/format";
import { formatQty } from "@/lib/warehouse";
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

  return (
    <div>
      <SectionTitle
        eyebrow="Склад"
        title="Инвентаризация"
        description="Укажите фактический остаток — система скорректирует учёт."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Активных позиций: {skus.length}
        </p>
        <ButtonLink href="/owner/warehouse" variant="ghost">
          ← К остаткам
        </ButtonLink>
      </Toolbar>

      {skus.length === 0 ? (
        <EmptyStub
          title="Нет позиций для пересчёта"
          description="Сначала добавьте техжидкости на склад."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <FormCard>
            <h2 className="brand-mark mb-4 text-lg">Пересчёт остатка</h2>
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
