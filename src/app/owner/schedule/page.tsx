import {
  createStaffShift,
  deleteStaffShift,
} from "@/app/actions/staff";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { formatDateTime } from "@/lib/format";
import { SectionTitle, SubmitButton } from "@/components/ui";
import {
  DataTable,
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
  Toolbar,
} from "@/components/forms";

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function SchedulePage() {
  const session = await requireStaffSession(["OWNER"]);
  const organizationId = orgIdOf(session);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  const day = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - day);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const defaultStart = new Date(now);
  defaultStart.setHours(9, 0, 0, 0);
  const defaultEnd = new Date(now);
  defaultEnd.setHours(18, 0, 0, 0);

  const [profiles, posts, shifts] = await Promise.all([
    prisma.staffProfile.findMany({
      where: { organizationId, isActive: true },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.servicePost.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.staffShift.findMany({
      where: {
        organizationId,
        startsAt: { lt: weekEnd },
        endsAt: { gt: weekStart },
      },
      include: {
        staffProfile: { include: { user: true } },
        post: true,
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-10">
      <SectionTitle
        eyebrow="График"
        title="Смены персонала"
        description="Назначьте смены мойщикам и слесарям по постам. MVP: неделя вокруг сегодня."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Неделя: {weekStart.toLocaleDateString("ru-RU")} —{" "}
          {new Date(weekEnd.getTime() - 1).toLocaleDateString("ru-RU")}
        </p>
      </Toolbar>

      <DataTable
        headers={["Сотрудник", "Пост", "Начало", "Конец", ""]}
      >
        {shifts.length === 0 ? (
          <tr>
            <td
              colSpan={5}
              className="px-4 py-8 text-center text-[var(--ink-soft)]"
            >
              Смен на этой неделе нет
            </td>
          </tr>
        ) : (
          shifts.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-[var(--ink)]">
                  {s.staffProfile.user.name}
                </p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {s.staffProfile.title}
                </p>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {s.post?.name ?? "—"}
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {formatDateTime(s.startsAt)}
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {formatDateTime(s.endsAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <form action={deleteStaffShift}>
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="cursor-pointer text-xs font-semibold text-red-700"
                  >
                    Удалить
                  </button>
                </form>
              </td>
            </tr>
          ))
        )}
      </DataTable>

      <FormCard className="max-w-xl">
        <h2 className="brand-mark mb-4 text-lg">Добавить смену</h2>
        <form action={createStaffShift} className="space-y-4">
          <Field label="Сотрудник" htmlFor="staffProfileId">
            <TextSelect id="staffProfileId" name="staffProfileId" required>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.user.name} · {p.title}
                </option>
              ))}
            </TextSelect>
          </Field>
          <Field label="Пост (необязательно)" htmlFor="postId">
            <TextSelect id="postId" name="postId" defaultValue="">
              <option value="">Без поста</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </TextSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Начало" htmlFor="startsAt">
              <TextInput
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={toLocalInputValue(defaultStart)}
              />
            </Field>
            <Field label="Конец" htmlFor="endsAt">
              <TextInput
                id="endsAt"
                name="endsAt"
                type="datetime-local"
                required
                defaultValue={toLocalInputValue(defaultEnd)}
              />
            </Field>
          </div>
          <Field label="Заметка" htmlFor="note">
            <TextInput id="note" name="note" placeholder="Опционально" />
          </Field>
          <FormActions>
            <SubmitButton className="sm:w-auto">Добавить смену</SubmitButton>
          </FormActions>
        </form>
      </FormCard>
    </div>
  );
}
