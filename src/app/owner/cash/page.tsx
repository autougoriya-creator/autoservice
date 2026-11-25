import Link from "next/link";
import { buildDailyCashSummary, PAYMENT_METHODS } from "@/lib/cash";
import {
  formatDate,
  formatDateTime,
  formatRub,
  paymentMethodLabel,
} from "@/lib/format";
import { workOrderNumberLabel } from "@/lib/work-order";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
import { EmptyStub, SectionTitle } from "@/components/ui";
import { DataTable, FormCard, Toolbar } from "@/components/forms";

function parseDay(raw: string | undefined) {
  if (!raw) return new Date();
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toInputDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const params = await searchParams;
  const day = parseDay(params.day);
  const summary = await buildDailyCashSummary(organizationId, day);
  const dayValue = toInputDate(day);
  const isOwner = session.membership.role === "OWNER";

  return (
    <div>
      <SectionTitle
        eyebrow="Касса"
        title={isOwner ? "Касса за день" : "Операционная касса за день"}
        description={
          isOwner
            ? "Сводка оплат по закрытым заказ-нарядам. Для снятия кассы — нал в кассе и терминал отдельно (включая доли «нал+терминал»)."
            : "Сводка оплат точки за выбранный день (операционный просмотр администратора)."
        }
      />

      <Toolbar>
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[var(--ink-soft)]">
              День
            </span>
            <input
              type="date"
              name="day"
              defaultValue={dayValue}
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
        <p className="text-sm text-[var(--ink-soft)]">
          {formatDate(summary.start)} · платежей: {summary.count}
        </p>
      </Toolbar>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Итого выручка
          </p>
          <p className="brand-mark mt-2 text-2xl">{formatRub(summary.totalRub)}</p>
        </FormCard>
        <FormCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            В кассе (нал)
          </p>
          <p className="brand-mark mt-2 text-2xl">
            {formatRub(summary.cashDrawerRub)}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">
            Наличные + доля нал из «нал+терминал»
          </p>
        </FormCard>
        <FormCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            По терминалу
          </p>
          <p className="brand-mark mt-2 text-2xl">
            {formatRub(summary.terminalSettledRub)}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">
            Терминал + доля терминала из «нал+терминал»
          </p>
        </FormCard>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PAYMENT_METHODS.map((method) => (
          <FormCard key={method}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              {paymentMethodLabel[method]}
            </p>
            <p className="brand-mark mt-2 text-xl">
              {formatRub(summary.byMethod[method].totalRub)}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              {summary.byMethod[method].count} шт.
            </p>
          </FormCard>
        ))}
      </div>

      {summary.rows.length === 0 ? (
        <EmptyStub
          title="Оплат за день нет"
          description="Закройте заказ-наряд с видом оплаты — он появится в кассе."
        />
      ) : (
        <DataTable
          headers={[
            "ЗН",
            "Клиент (телефон)",
            "Оплата",
            "Сумма",
            "Нал / терминал",
            "Время",
            "",
          ]}
        >
          {summary.rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-semibold text-[var(--ink)]">
                {workOrderNumberLabel(row.number)}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-[var(--ink)]">{row.customerName}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {row.customerPhone} · {row.vehiclePlate}
                </p>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {paymentMethodLabel[row.paymentMethod] ?? row.paymentMethod}
              </td>
              <td className="px-4 py-3 font-medium">{formatRub(row.amountRub)}</td>
              <td className="px-4 py-3 text-sm text-[var(--ink-soft)]">
                {row.paymentMethod === "CASH_AND_TERMINAL" ||
                row.paymentMethod === "CASH" ||
                row.paymentMethod === "TERMINAL" ? (
                  <>
                    {formatRub(row.cashPaidRub ?? 0)}
                    {" / "}
                    {formatRub(row.terminalPaidRub ?? 0)}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-[var(--ink-soft)]">
                {formatDateTime(row.paidAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/owner/work-orders/${row.id}`}
                  className="text-sm font-semibold text-[var(--accent)]"
                >
                  Открыть
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
