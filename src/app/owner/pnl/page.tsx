import Link from "next/link";
import { buildPostPnL } from "@/lib/pnl";
import { orgIdOf, requireOwnerSession } from "@/lib/tenant";
import { formatDate, formatDateTime, formatRub } from "@/lib/format";
import type { PeriodKey } from "@/lib/payroll";
import { workOrderNumberLabel } from "@/lib/work-order";
import { SectionTitle, StatusPill } from "@/components/ui";
import { DataTable, Toolbar } from "@/components/forms";

export default async function PnLPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const sp = await searchParams;
  const period: PeriodKey = sp.period === "week" ? "week" : "day";

  const data = await buildPostPnL(organizationId, period);

  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Экономика"
        title="Выручка и ФОТ по постам"
        description="Сводка: выручка ЗН по постам минус ФОТ исполнителей и бонус админу за допродажи из закрытых ЗН (админ без поста)."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Период: {formatDate(data.start)}
          {period === "week" ? ` — ${formatDate(data.end)}` : ""}
        </p>
        <div className="flex gap-2">
          <PeriodLink href="/owner/pnl?period=day" active={period === "day"}>
            День
          </PeriodLink>
          <PeriodLink href="/owner/pnl?period=week" active={period === "week"}>
            Неделя
          </PeriodLink>
        </div>
      </Toolbar>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Выручка" value={formatRub(data.totals.revenue)} />
        <SummaryCard label="ФОТ (оценка)" value={formatRub(data.totals.payroll)} />
        <SummaryCard
          label={`Бонус админу (${data.totals.adminUpsellPercent}%)`}
          value={formatRub(data.totals.adminUpsellBonus)}
        />
        <SummaryCard
          label="Маржа"
          value={formatRub(data.totals.margin)}
          accent={data.totals.margin >= 0}
        />
      </div>

      <DataTable
        headers={[
          "Пост",
          "ЗН",
          "Выручка",
          "ФОТ",
          "Маржа",
          "Персонал",
        ]}
      >
        {data.rows.map((row) => (
          <tr key={row.postId}>
            <td className="px-4 py-3 font-medium text-[var(--ink)]">
              {row.postName}
            </td>
            <td className="px-4 py-3 text-[var(--ink-soft)]">
              {row.workOrderCount}
            </td>
            <td className="px-4 py-3">{formatRub(row.revenue)}</td>
            <td className="px-4 py-3">{formatRub(row.payroll)}</td>
            <td className="px-4 py-3">
              <StatusPill tone={row.margin >= 0 ? "ok" : "warn"}>
                {formatRub(row.margin)}
              </StatusPill>
            </td>
            <td className="px-4 py-3 text-sm text-[var(--ink-soft)]">
              {row.staff.length === 0
                ? "—"
                : row.staff
                    .map(
                      (s) =>
                        `${s.name} · доля ${s.sharePercent}% (${s.payMode === "SALARY" ? "оклад" : "сделка"} ${formatRub(s.cost)})`,
                    )
                    .join("; ")}
            </td>
          </tr>
        ))}
      </DataTable>

      <section className="space-y-4">
        <h2 className="brand-mark text-xl text-[var(--ink)]">
          Допродажи за смену админа → бонус
        </h2>
        <p className="text-sm text-[var(--ink-soft)]">
          База допродаж: {formatRub(data.totals.adminUpsellAmount)} · ставка{" "}
          {data.totals.adminUpsellPercent}% · начисление{" "}
          {formatRub(data.totals.adminUpsellBonus)} (закрытые ЗН в окна смен
          админа, без поста). Процент — в{" "}
          <Link href="/owner/staff" className="font-semibold text-[var(--accent)]">
            Персонале
          </Link>
          .
        </p>
        {data.adminUpsell.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/60 px-5 py-8 text-sm text-[var(--ink-soft)]">
            В сменах админа за период нет закрытых ЗН с допродажами после
            самозаписи на одну услугу.
          </p>
        ) : (
          <DataTable
            headers={[
              "ЗН",
              "Запись",
              "Допродажа",
              "Бонус",
              "Закрыт",
            ]}
          >
            {data.adminUpsell.rows.map((row) => (
              <tr key={row.workOrderId}>
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/owner/work-orders/${row.workOrderId}`}
                    className="hover:text-[var(--accent)]"
                  >
                    {workOrderNumberLabel(row.number)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--ink-soft)]">
                  {row.bookedServiceName} · {formatRub(row.bookingPlannedRub)} →{" "}
                  {formatRub(row.workOrderTotalRub)}
                </td>
                <td className="px-4 py-3">{formatRub(row.upsellRub)}</td>
                <td className="px-4 py-3 font-medium text-[var(--accent)]">
                  {formatRub(row.bonusRub)}
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {formatDateTime(row.completedAt)}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <p className="text-xs text-[var(--ink-soft)]">
        Сделка: % от доли выручки поста (доля исполнителя × % сделки). При
        нескольких мойщиках на посту доли задаются в карточке поста. Оклад:
        доля месячной ЗП пропорционально дням смен (база 30 дней). Бонус
        админу: % от суммы доп. услуг в закрытом ЗН после самозаписи на одну
        услугу.
      </p>
    </div>
  );
}

function PeriodLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[var(--ink)] text-white"
          : "border border-[var(--line)] bg-white/70 text-[var(--ink-soft)] hover:text-[var(--ink)]"
      }`}
    >
      {children}
    </Link>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/85 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
        {label}
      </p>
      <p
        className={`brand-mark mt-3 text-2xl ${
          accent === false ? "text-[#7a5a12]" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
