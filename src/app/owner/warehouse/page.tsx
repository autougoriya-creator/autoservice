import Link from "next/link";
import {
  consumeStock,
  receiveStock,
} from "@/app/actions/warehouse";
import { prisma } from "@/lib/prisma";
import { formatDateTime, stockMovementLabel } from "@/lib/format";
import { formatQty } from "@/lib/warehouse";
import { workOrderNumberLabel } from "@/lib/work-order";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
import {
  ButtonLink,
  EmptyStub,
  SectionTitle,
  StatusPill,
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

export default async function WarehousePage() {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);

  const [skus, movements] = await Promise.all([
    prisma.fluidSku.findMany({
      where: { organizationId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.stockMovement.findMany({
      where: { organizationId },
      include: {
        fluidSku: true,
        createdBy: true,
        workOrder: { include: { post: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const activeSkus = skus.filter((s) => s.isActive);

  return (
    <div>
      <SectionTitle
        eyebrow="Склад"
        title="Техжидкости"
        description="Остатки, поступление и расход по заказ-нарядам. Учёт по организации."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Позиций: {skus.length}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/owner/warehouse/reconcile" variant="ghost">
            Сверка
          </ButtonLink>
          <ButtonLink href="/owner/warehouse/inventory" variant="ghost">
            Инвентаризация
          </ButtonLink>
          <ButtonLink href="/owner/warehouse/new">Новая позиция</ButtonLink>
        </div>
      </Toolbar>

      {skus.length === 0 ? (
        <EmptyStub
          title="Склад пуст"
          description="Добавьте шампунь, воск и другие техжидкости."
        />
      ) : (
        <DataTable
          headers={["Позиция", "Код", "Остаток", "Статус", ""]}
        >
          {skus.map((sku) => (
            <tr key={sku.id}>
              <td className="px-4 py-3 font-medium text-[var(--ink)]">
                <Link
                  href={`/owner/warehouse/${sku.id}`}
                  className="hover:text-[var(--accent)]"
                >
                  {sku.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {sku.skuCode ?? "—"}
              </td>
              <td className="px-4 py-3 font-semibold">
                {formatQty(sku.quantityOnHand, sku.unit)}
              </td>
              <td className="px-4 py-3">
                <StatusPill tone={sku.isActive ? "ok" : "neutral"}>
                  {sku.isActive ? "В учёте" : "Скрыта"}
                </StatusPill>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/owner/warehouse/${sku.id}`}
                  className="text-sm font-semibold text-[var(--accent)]"
                >
                  Открыть
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {activeSkus.length > 0 ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <FormCard>
            <h2 className="brand-mark mb-4 text-lg">Поступление</h2>
            <form action={receiveStock} className="space-y-4">
              <Field label="Позиция" htmlFor="receiveSku">
                <TextSelect id="receiveSku" name="fluidSkuId" required>
                  <option value="">— выберите —</option>
                  {activeSkus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name} ({formatQty(sku.quantityOnHand, sku.unit)})
                    </option>
                  ))}
                </TextSelect>
              </Field>
              <Field label="Количество" htmlFor="receiveQty">
                <TextInput
                  id="receiveQty"
                  name="quantity"
                  required
                  inputMode="decimal"
                  placeholder="10"
                />
              </Field>
              <Field label="Комментарий" htmlFor="receiveNote">
                <TextTextarea
                  id="receiveNote"
                  name="note"
                  placeholder="Накладная, поставщик…"
                />
              </Field>
              <SubmitButton>Оприходовать</SubmitButton>
            </form>
          </FormCard>

          <FormCard>
            <h2 className="brand-mark mb-4 text-lg">Расход</h2>
            <form action={consumeStock} className="space-y-4">
              <Field label="Позиция" htmlFor="consumeSku">
                <TextSelect id="consumeSku" name="fluidSkuId" required>
                  <option value="">— выберите —</option>
                  {activeSkus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name} ({formatQty(sku.quantityOnHand, sku.unit)})
                    </option>
                  ))}
                </TextSelect>
              </Field>
              <Field label="Количество" htmlFor="consumeQty">
                <TextInput
                  id="consumeQty"
                  name="quantity"
                  required
                  inputMode="decimal"
                  placeholder="0.5"
                />
              </Field>
              <Field label="Комментарий" htmlFor="consumeNote">
                <TextTextarea
                  id="consumeNote"
                  name="note"
                  placeholder="Ручное списание"
                />
              </Field>
              <SubmitButton>Списать</SubmitButton>
            </form>
          </FormCard>
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="brand-mark mb-4 text-xl">Последние движения</h2>
        {movements.length === 0 ? (
          <EmptyStub
            title="Движений пока нет"
            description="Поступление, расход по ЗН или инвентаризация появятся здесь."
          />
        ) : (
          <DataTable
            headers={[
              "Когда",
              "Тип",
              "Позиция",
              "Δ",
              "Остаток",
              "Заказ-наряд",
              "Кто",
            ]}
          >
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 whitespace-nowrap text-[var(--ink-soft)]">
                  {formatDateTime(m.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {stockMovementLabel[m.type] ?? m.type}
                </td>
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/owner/warehouse/${m.fluidSkuId}`}
                    className="hover:text-[var(--accent)]"
                  >
                    {m.fluidSku.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-semibold">
                  {m.quantityDelta > 0 ? "+" : ""}
                  {formatQty(m.quantityDelta, m.fluidSku.unit)}
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {formatQty(m.quantityAfter, m.fluidSku.unit)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {m.workOrder ? (
                    <span>
                      <Link
                        href={`/owner/work-orders/${m.workOrder.id}`}
                        className="font-semibold text-[var(--accent)] hover:underline"
                      >
                        {workOrderNumberLabel(m.workOrder.number)}
                      </Link>
                      {m.workOrder.post ? (
                        <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                          {m.workOrder.post.name}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-[var(--ink-soft)]">
                      {m.note ?? "—"}
                    </span>
                  )}
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
