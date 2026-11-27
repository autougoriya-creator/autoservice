import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatQty } from "@/lib/warehouse";
import { buildWarehouseReconcile } from "@/lib/warehouse-reconcile";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
import {
  ButtonLink,
  EmptyStub,
  SectionTitle,
  StatusPill,
} from "@/components/ui";
import { DataTable, FormCard, Toolbar } from "@/components/forms";

export default async function WarehouseReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const params = await searchParams;
  const data = await buildWarehouseReconcile(
    organizationId,
    params.from,
    params.to,
  );

  const postBlocks = [
    ...data.postRows,
    ...(data.unassigned ? [data.unassigned] : []),
  ];

  return (
    <div>
      <SectionTitle
        eyebrow="Склад"
        title="Сверка за период"
        description="Расход по нормам услуг (ЗН в работе / закрыт) по постам и сравнение ожидаемого остатка с фактом после инвентаризации."
      />

      <Toolbar>
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[var(--ink-soft)]">
              С
            </span>
            <input
              type="date"
              name="from"
              defaultValue={data.fromValue}
              className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[var(--ink-soft)]">
              По
            </span>
            <input
              type="date"
              name="to"
              defaultValue={data.toValue}
              className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-md bg-[var(--ink)] px-5 text-sm font-semibold text-white"
          >
            Показать
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/owner/warehouse/inventory" variant="ghost">
            Инвентаризация
          </ButtonLink>
          <ButtonLink href="/owner/warehouse" variant="ghost">
            ← К остаткам
          </ButtonLink>
        </div>
      </Toolbar>

      <p className="mb-6 text-sm text-[var(--ink-soft)]">
        Период: {formatDate(data.from)} — {formatDate(data.to)}. Ожидаемый
        остаток = начало + приход − расход по норме − ручной расход. Факт —
        последняя инвентаризация в периоде (иначе текущий учёт).
      </p>

      {data.skuRows.length === 0 ? (
        <EmptyStub
          title="Нет позиций склада"
          description="Добавьте техжидкости, чтобы считать сверку."
        />
      ) : (
        <DataTable
          headers={[
            "Позиция",
            "Начало",
            "Приход",
            "По норме",
            "Списано по ЗН",
            "Ручной расход",
            "Ожидаемо",
            "Факт",
            "Δ",
          ]}
        >
          {data.skuRows.map((row) => (
            <tr key={row.fluidSkuId}>
              <td className="px-4 py-3 font-medium">
                <Link
                  href={`/owner/warehouse/${row.fluidSkuId}`}
                  className="hover:text-[var(--accent)]"
                >
                  {row.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {formatQty(row.opening, row.unit)}
              </td>
              <td className="px-4 py-3">
                {formatQty(row.receipts, row.unit)}
              </td>
              <td className="px-4 py-3 font-semibold">
                {formatQty(row.normConsumption, row.unit)}
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {formatQty(row.woWriteoff, row.unit)}
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {formatQty(row.manualConsumption, row.unit)}
              </td>
              <td className="px-4 py-3">
                {formatQty(row.expected, row.unit)}
              </td>
              <td className="px-4 py-3">
                {formatQty(row.fact, row.unit)}
                {!row.hasInventoryInPeriod ? (
                  <span className="ml-1 text-xs text-[var(--ink-soft)]">
                    учёт
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  tone={
                    Math.abs(row.variance) < 0.001
                      ? "ok"
                      : row.variance < 0
                        ? "warn"
                        : "accent"
                  }
                >
                  {row.variance > 0 ? "+" : ""}
                  {formatQty(row.variance, row.unit)}
                </StatusPill>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <section className="mt-10 space-y-4">
        <h2 className="brand-mark text-xl">Расход по норме по постам</h2>
        {postBlocks.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            За период нет заказ-нарядов с нормами расхода.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {postBlocks.map((post) => (
              <FormCard key={post.postId || "none"}>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="brand-mark text-lg">{post.postName}</h3>
                  <span className="text-xs text-[var(--ink-soft)]">
                    ЗН: {post.workOrderCount}
                  </span>
                </div>
                {post.fluids.length === 0 ? (
                  <p className="text-sm text-[var(--ink-soft)]">
                    Норм расхода в услугах этих ЗН нет.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--line)]">
                    {post.fluids.map((f) => (
                      <li
                        key={f.fluidSkuId}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <Link
                          href={`/owner/warehouse/${f.fluidSkuId}`}
                          className="font-medium hover:text-[var(--accent)]"
                        >
                          {f.name}
                        </Link>
                        <span className="font-semibold">
                          {formatQty(f.quantity, f.unit)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </FormCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
