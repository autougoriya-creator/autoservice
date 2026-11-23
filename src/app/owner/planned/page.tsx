import Link from "next/link";
import { buildPlannedRevenue } from "@/lib/booking-plan";
import { formatDate, formatDateTime, formatRub } from "@/lib/format";
import type { PeriodKey } from "@/lib/payroll";
import { orgIdOf, requireOwnerSession } from "@/lib/tenant";
import { SectionTitle, StatusPill } from "@/components/ui";
import { DataTable, Toolbar } from "@/components/forms";

export default async function PlannedRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const sp = await searchParams;
  const period: PeriodKey = sp.period === "week" ? "week" : "day";
  const data = await buildPlannedRevenue(organizationId, period);

  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Финансы"
        title="План выручки"
        description="Сумма плановых сумм по записям (услуги из каталога). Не путать с фактической выручкой по заказ-нарядам."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Период: {formatDate(data.start)}
          {period === "week" ? ` — ${formatDate(data.end)}` : ""}
        </p>
        <div className="flex gap-2">
          <PeriodLink href="/owner/planned?period=day" active={period === "day"}>
            День
          </PeriodLink>
          <PeriodLink
            href="/owner/planned?period=week"
            active={period === "week"}
          >
            Неделя
          </PeriodLink>
        </div>
      </Toolbar>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-white/85 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            План по записям
          </p>
          <p className="brand-mark mt-3 text-3xl text-[var(--ink)]">
            {formatRub(data.totalPlanned)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white/85 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Записей в периоде
          </p>
          <p className="brand-mark mt-3 text-3xl text-[var(--ink)]">
            {data.bookingCount}
          </p>
        </div>
      </div>

      <DataTable headers={["Пост", "Записей", "План выручки"]}>
        {data.byPost.map((row) => (
          <tr key={row.postId}>
            <td className="px-4 py-3 font-medium text-[var(--ink)]">
              {row.postName}
            </td>
            <td className="px-4 py-3 text-[var(--ink-soft)]">
              {row.bookingCount}
            </td>
            <td className="px-4 py-3">
              <StatusPill tone="ok">{formatRub(row.plannedAmountRub)}</StatusPill>
            </td>
          </tr>
        ))}
        {data.unassigned.bookingCount > 0 ? (
          <tr>
            <td className="px-4 py-3 text-[var(--ink-soft)]">Без поста</td>
            <td className="px-4 py-3 text-[var(--ink-soft)]">
              {data.unassigned.bookingCount}
            </td>
            <td className="px-4 py-3">
              {formatRub(data.unassigned.plannedAmountRub)}
            </td>
          </tr>
        ) : null}
      </DataTable>

      <section className="space-y-4">
        <h2 className="brand-mark text-xl text-[var(--ink)]">Записи по постам</h2>
        {data.byPost.map((row) =>
          row.bookings.length === 0 ? null : (
            <div key={row.postId}>
              <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">
                {row.postName}
              </h3>
              <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-white/85">
                {row.bookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-[var(--ink)]">
                        {b.serviceName}
                      </p>
                      <p className="text-xs text-[var(--ink-soft)]">
                        {formatDateTime(b.startsAt)}
                        {b.vehicleInfo ? ` · ${b.vehicleInfo}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatRub(b.plannedAmountRub)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </section>

      <p className="text-sm text-[var(--ink-soft)]">
        Фактическая выручка по заказ-нарядам — в{" "}
        <Link href="/owner/pnl" className="font-semibold text-[var(--accent)]">
          Экономике
        </Link>
        .
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
