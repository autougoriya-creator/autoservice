import Link from "next/link";
import {
  updateAdminUpsellBonusPercent,
  upsertStaffProfile,
} from "@/app/actions/staff";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireOwnerSession } from "@/lib/tenant";
import { payModeLabel } from "@/lib/payroll";
import { formatRub } from "@/lib/format";
import { ButtonLink, SectionTitle, StatusPill, SubmitButton } from "@/components/ui";
import {
  DataTable,
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
  Toolbar,
} from "@/components/forms";

export default async function StaffPage() {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);

  const [org, profiles, staffUsers, assignments] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId },
      select: { adminUpsellBonusPercent: true },
    }),
    prisma.staffProfile.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { organizationId, role: { in: ["STAFF", "ADMIN"] } },
      include: { user: true },
      orderBy: { role: "asc" },
    }),
    prisma.postAssignment.findMany({
      where: { organizationId, activeTo: null },
      include: {
        post: true,
        staffProfile: { include: { user: true } },
      },
    }),
  ]);

  const profiledUserIds = new Set(profiles.map((p) => p.userId));
  const unprofiled = staffUsers.filter((m) => !profiledUserIds.has(m.userId));
  const bonusPercent = org?.adminUpsellBonusPercent ?? 0;
  const roleByUserId = new Map(staffUsers.map((m) => [m.userId, m.role]));

  return (
    <div className="space-y-10">
      <SectionTitle
        eyebrow="Персонал"
        title="Сотрудники и оплата"
        description="Мойщики и слесари — смены на постах в «График»; администратор без поста: оклад + бонус за допродажи из закрытых ЗН за смену."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Профилей: {profiles.length}
        </p>
        <ButtonLink href="/owner/schedule" variant="ghost">
          График смен
        </ButtonLink>
        <ButtonLink href="/owner/posts" variant="ghost">
          Посты и доли
        </ButtonLink>
        <ButtonLink href="/owner/pnl" variant="ghost">
          Экономика
        </ButtonLink>
      </Toolbar>

      <FormCard>
        <h2 className="brand-mark mb-2 text-lg">Бонус администратору за допродажи</h2>
        <p className="mb-4 text-sm text-[var(--ink-soft)]">
          Если клиент самозаписался на одну услугу, а заказ-наряд закрыт в смену
          администратора с дополнительными услугами — админ получает % от суммы
          этих допродаж к ЗП (не от поста: у администратора поста нет).
        </p>
        <form action={updateAdminUpsellBonusPercent} className="flex flex-wrap items-end gap-4">
          <Field label="% от допродаж" htmlFor="adminUpsellBonusPercent">
            <TextInput
              id="adminUpsellBonusPercent"
              name="adminUpsellBonusPercent"
              inputMode="numeric"
              defaultValue={String(bonusPercent)}
              className="w-28"
            />
          </Field>
          <FormActions>
            <SubmitButton className="sm:w-auto">Сохранить %</SubmitButton>
          </FormActions>
        </form>
      </FormCard>

      <DataTable
        headers={["Сотрудник", "Должность", "Оплата", "Посты (из графика)", ""]}
      >
        {profiles.map((p) => {
          const isAdminProfile = roleByUserId.get(p.userId) === "ADMIN";
          const myAssignments = isAdminProfile
            ? []
            : assignments.filter((a) => a.staffProfileId === p.id);
          return (
            <tr key={p.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-[var(--ink)]">{p.user.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">{p.user.email}</p>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">{p.title}</td>
              <td className="px-4 py-3">
                <StatusPill tone={p.payMode === "SALARY" ? "warn" : "ok"}>
                  {payModeLabel(p.payMode)}
                </StatusPill>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  {p.payMode === "SALARY"
                    ? formatRub(p.salaryRub) + " / мес"
                    : `${p.dealPercent}% от доли поста`}
                </p>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {isAdminProfile
                  ? "без поста"
                  : myAssignments.length === 0
                    ? "—"
                    : myAssignments
                        .map((a) => `${a.post.name} (${a.sharePercent}%)`)
                        .join(", ")}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/owner/staff/${p.id}`}
                  className="text-sm font-semibold text-[var(--accent)]"
                >
                  Настроить
                </Link>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <FormCard className="max-w-xl">
        <h2 className="brand-mark mb-4 text-lg">Профиль сотрудника</h2>
        <p className="mb-4 text-xs text-[var(--ink-soft)]">
          Смены и посты назначаются только в{" "}
          <Link
            href="/owner/schedule"
            className="font-semibold text-[var(--accent)]"
          >
            графике работы
          </Link>
          . Доли % — в карточках постов.
        </p>
        <form action={upsertStaffProfile} className="space-y-4">
          <Field label="Пользователь (сотрудник или админ)" htmlFor="userId">
            <TextSelect id="userId" name="userId" required>
              <option value="">Выберите…</option>
              {staffUsers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name} · {m.role === "ADMIN" ? "админ" : "сотрудник"} ·{" "}
                  {m.user.email}
                  {profiledUserIds.has(m.userId) ? " (есть профиль)" : ""}
                </option>
              ))}
            </TextSelect>
          </Field>
          <Field label="Должность" htmlFor="title">
            <TextInput
              id="title"
              name="title"
              defaultValue="Мойщик"
              placeholder="Мойщик / Слесарь"
            />
          </Field>
          <Field label="Режим оплаты" htmlFor="payMode">
            <TextSelect id="payMode" name="payMode" defaultValue="DEAL">
              <option value="DEAL">Сделка — % от заказ-наряда</option>
              <option value="SALARY">Оклад — фиксированная ЗП</option>
            </TextSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="% сделки" htmlFor="dealPercent">
              <TextInput
                id="dealPercent"
                name="dealPercent"
                inputMode="numeric"
                defaultValue="30"
              />
            </Field>
            <Field label="Оклад, ₽/мес" htmlFor="salaryRub">
              <TextInput
                id="salaryRub"
                name="salaryRub"
                inputMode="numeric"
                defaultValue="0"
              />
            </Field>
          </div>
          <FormActions>
            <SubmitButton className="sm:w-auto">Сохранить профиль</SubmitButton>
          </FormActions>
        </form>
        {unprofiled.length > 0 ? (
          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            Без профиля: {unprofiled.map((m) => m.user.name).join(", ")}
          </p>
        ) : null}
      </FormCard>
    </div>
  );
}
