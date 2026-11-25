import Link from "next/link";
import {
  assignStaffToPost,
  clearPostAssignment,
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

  const [profiles, staffUsers, posts, assignments] = await Promise.all([
    prisma.staffProfile.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { organizationId, role: "STAFF" },
      include: { user: true },
    }),
    prisma.servicePost.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
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

  return (
    <div className="space-y-10">
      <SectionTitle
        eyebrow="Персонал"
        title="Сотрудники и оплата"
        description="Мойщики и слесари: режим оплаты (сделка % или оклад). На одном посту может быть несколько исполнителей — доли в карточке поста."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Профилей: {profiles.length}
        </p>
        <ButtonLink href="/owner/posts" variant="ghost">
          Посты и доли
        </ButtonLink>
        <ButtonLink href="/owner/schedule" variant="ghost">
          График смен
        </ButtonLink>
      </Toolbar>

      <DataTable
        headers={["Сотрудник", "Должность", "Оплата", "Посты", ""]}
      >
        {profiles.map((p) => {
          const myAssignments = assignments.filter(
            (a) => a.staffProfileId === p.id,
          );
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
                {myAssignments.length === 0
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

      <div className="grid gap-6 lg:grid-cols-2">
        <FormCard>
          <h2 className="brand-mark mb-4 text-lg">Профиль сотрудника</h2>
          <form action={upsertStaffProfile} className="space-y-4">
            <Field label="Пользователь (роль «Сотрудник»)" htmlFor="userId">
              <TextSelect id="userId" name="userId" required>
                <option value="">Выберите…</option>
                {staffUsers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user.name} · {m.user.email}
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

        <FormCard>
          <h2 className="brand-mark mb-4 text-lg">Закрепить за постом</h2>
          <p className="mb-3 text-xs text-[var(--ink-soft)]">
            На пост можно назначить нескольких. Доли % удобнее править в{" "}
            <Link href="/owner/posts" className="font-semibold text-[var(--accent)]">
              карточках постов
            </Link>
            .
          </p>
          <form action={assignStaffToPost} className="space-y-4">
            <Field label="Пост" htmlFor="postId">
              <TextSelect id="postId" name="postId" required>
                {posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </TextSelect>
            </Field>
            <Field label="Сотрудник" htmlFor="staffProfileId">
              <TextSelect id="staffProfileId" name="staffProfileId" required>
                {profiles
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.user.name} · {p.title}
                    </option>
                  ))}
              </TextSelect>
            </Field>
            <FormActions>
              <SubmitButton className="sm:w-auto">Закрепить</SubmitButton>
            </FormActions>
          </form>

          <ul className="mt-6 space-y-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-[var(--paper)] px-3 py-2 text-sm"
              >
                <span>
                  <strong>{a.post.name}</strong> → {a.staffProfile.user.name}{" "}
                  <span className="text-[var(--ink-soft)]">
                    ({a.sharePercent}%)
                  </span>
                </span>
                <form action={clearPostAssignment}>
                  <input type="hidden" name="id" value={a.id} />
                  <button
                    type="submit"
                    className="cursor-pointer text-xs font-semibold text-red-700"
                  >
                    Снять
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </FormCard>
      </div>
    </div>
  );
}
