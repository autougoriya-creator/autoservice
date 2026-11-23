import { redirect } from "next/navigation";
import Link from "next/link";
import { buildStaffPayrollEstimate } from "@/lib/pnl";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { formatDateTime, formatRub, workOrderStatusLabel } from "@/lib/format";
import { payModeLabel, type PeriodKey } from "@/lib/payroll";
import { workOrderNumberLabel } from "@/lib/work-order";
import { SectionTitle, StatusPill } from "@/components/ui";
import { DataTable, Toolbar } from "@/components/forms";

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireStaffSession(); // OWNER | ADMIN | STAFF
  const organizationId = orgIdOf(session);
  const sp = await searchParams;
  const period: PeriodKey = sp.period === "week" ? "week" : "day";

  // Owner can preview, but staff is the main audience
  const data = await buildStaffPayrollEstimate(
    organizationId,
    session.id,
    period,
  );

  if (!data) {
    if (session.membership.role === "OWNER") {
      return (
        <div>
          <SectionTitle
            eyebrow="Моя смена"
            title="Нет профиля сотрудника"
            description="У владельца нет StaffProfile. Откройте раздел Персонал или войдите как мойщик / слесарь."
          />
          <Link
            href="/owner/staff"
            className="text-sm font-semibold text-[var(--accent)]"
          >
            Перейти к персоналу →
          </Link>
        </div>
      );
    }
    if (session.membership.role === "ADMIN") {
      return (
        <div>
          <SectionTitle
            eyebrow="Моя смена"
            title="Кабинет сотрудника"
            description="У администратора нет профиля мойщика/слесаря. График и посты — в разделах «График» и «Рабочий стол»."
          />
          <Link
            href="/owner/schedule"
            className="text-sm font-semibold text-[var(--accent)]"
          >
            Открыть график →
          </Link>
        </div>
      );
    }
    redirect("/owner/desk");
  }

  const { profile, openAssignments, periodShifts, periodWOs, revenue, estimate } =
    data;

  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Моя смена"
        title={profile.user.name}
        description={`${profile.title} · ${payModeLabel(profile.payMode)}${
          profile.payMode === "SALARY"
            ? ` · ${formatRub(profile.salaryRub)}/мес`
            : ` · ${profile.dealPercent}%`
        }`}
      />

      <Toolbar>
        <div className="flex flex-wrap gap-2">
          {openAssignments.length === 0 ? (
            <StatusPill>Пост не закреплён</StatusPill>
          ) : (
            openAssignments.map((a) => (
              <StatusPill key={a.id} tone="ok">
                {a.post.name}
              </StatusPill>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <PeriodTab href="/owner/my-work?period=day" active={period === "day"}>
            День
          </PeriodTab>
          <PeriodTab href="/owner/my-work?period=week" active={period === "week"}>
            Неделя
          </PeriodTab>
        </div>
      </Toolbar>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-white/85 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Выручка на моих постах
          </p>
          <p className="brand-mark mt-3 text-3xl text-[var(--ink)]">
            {formatRub(revenue)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white/85 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Оценка начисления
          </p>
          <p className="brand-mark mt-3 text-3xl text-[var(--accent)]">
            {formatRub(estimate)}
          </p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">
            {profile.payMode === "SALARY"
              ? "Доля оклада по дням смен в периоде"
              : `% от выручки заказ-нарядов на закреплённых постах`}
          </p>
        </div>
      </div>

      <section>
        <h2 className="brand-mark mb-4 text-xl text-[var(--ink)]">Мой график</h2>
        {periodShifts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/60 px-5 py-8 text-sm text-[var(--ink-soft)]">
            Смен в выбранном периоде нет
          </p>
        ) : (
          <DataTable headers={["Начало", "Конец", "Пост", "Заметка"]}>
            {periodShifts.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">{formatDateTime(s.startsAt)}</td>
                <td className="px-4 py-3">{formatDateTime(s.endsAt)}</td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {s.post?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {s.note ?? "—"}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section>
        <h2 className="brand-mark mb-4 text-xl text-[var(--ink)]">
          Заказ-наряды постов
        </h2>
        {periodWOs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/60 px-5 py-8 text-sm text-[var(--ink-soft)]">
            Заказ-нарядов за период нет
          </p>
        ) : (
          <DataTable headers={["Документ", "Пост", "Сумма", "Статус", "Когда"]}>
            {periodWOs.map((wo) => (
              <tr key={wo.id}>
                <td className="px-4 py-3 font-medium">
                  {workOrderNumberLabel(wo.number)}
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {wo.postName}
                </td>
                <td className="px-4 py-3">{formatRub(wo.total)}</td>
                <td className="px-4 py-3">
                  <StatusPill>
                    {workOrderStatusLabel[wo.status] ?? wo.status}
                  </StatusPill>
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">
                  {formatDateTime(wo.when)}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}

function PeriodTab({
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
