import Link from "next/link";
import { buildPostPnL } from "@/lib/pnl";
import { orgIdOf, requireOwnerSession } from "@/lib/tenant";
import { formatDate, formatRub } from "@/lib/format";
import type { PeriodKey } from "@/lib/payroll";
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
        description="Сводка: выручка заказ-нарядов на посту минус расчётный ФОТ закреплённого персонала за день или неделю."
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

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Выручка" value={formatRub(data.totals.revenue)} />
        <SummaryCard label="ФОТ (оценка)" value={formatRub(data.totals.payroll)} />
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

      <p className="text-xs text-[var(--ink-soft)]">
        Сделка: % от доли выручки поста (доля исполнителя × % сделки). При
        нескольких мойщиках на посту доли задаются в карточке поста. Оклад:
        доля месячной ЗП пропорционально дням смен (база 30 дней).
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
