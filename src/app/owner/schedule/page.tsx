import {
  bulkFillStaffShifts,
  createStaffShift,
  deleteStaffShift,
  replacePostStaffNow,
} from "@/app/actions/staff";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
import { formatDateTime } from "@/lib/format";
import { formatPostHours } from "@/lib/payroll";
import {
  WEEKDAY_LABELS,
  toDateInputValue,
} from "@/lib/schedule-fill";
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

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    bulkCreated?: string;
    bulkSkipped?: string;
    replaced?: string;
  }>;
}) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const flash = await searchParams;

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

  const periodFrom = new Date(now);
  periodFrom.setHours(0, 0, 0, 0);
  const periodTo = new Date(periodFrom);
  periodTo.setDate(periodFrom.getDate() + 13);

  const [profiles, posts, shifts, openAssignments, adminMemberships] =
    await Promise.all([
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
      prisma.postAssignment.findMany({
        where: { organizationId, activeTo: null },
        include: {
          staffProfile: { include: { user: true } },
          post: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.membership.findMany({
        where: { organizationId, role: "ADMIN" },
        select: { userId: true },
      }),
    ]);

  const adminUserIds = new Set(adminMemberships.map((m) => m.userId));
  const floorProfiles = profiles.filter((p) => !adminUserIds.has(p.userId));

  const assignmentsByPost = new Map<string, typeof openAssignments>();
  for (const a of openAssignments) {
    const list = assignmentsByPost.get(a.postId) ?? [];
    list.push(a);
    assignmentsByPost.set(a.postId, list);
  }

  const bulkCreated = Number.parseInt(flash.bulkCreated ?? "", 10);
  const bulkSkipped = Number.parseInt(flash.bulkSkipped ?? "", 10);
  const showBulkFlash = Number.isFinite(bulkCreated);
  const showReplaced = flash.replaced === "1";

  return (
    <div className="space-y-10">
      <SectionTitle
        eyebrow="График"
        title="Смены персонала"
        description="Массовое заполнение по посту, замена «здесь и сейчас». Мойщики/слесари — с постом; администратор — смена без поста (бонус за закрытые ЗН)."
      />

      {showBulkFlash ? (
        <p className="rounded-lg border border-[var(--line)] bg-white/85 px-4 py-3 text-sm text-[var(--ink)]">
          Создано смен: <strong>{bulkCreated}</strong>
          {Number.isFinite(bulkSkipped) && bulkSkipped > 0
            ? ` · пропущено пересечений: ${bulkSkipped}`
            : null}
        </p>
      ) : null}
      {showReplaced ? (
        <p className="rounded-lg border border-[var(--line)] bg-white/85 px-4 py-3 text-sm text-[var(--ink)]">
          Замена на посту применена: назначение обновлено, смена на сегодня
          скорректирована.
        </p>
      ) : null}

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Неделя: {weekStart.toLocaleDateString("ru-RU")} —{" "}
          {new Date(weekEnd.getTime() - 1).toLocaleDateString("ru-RU")}
        </p>
      </Toolbar>

      <div className="grid gap-6 xl:grid-cols-2">
        <FormCard>
          <h2 className="brand-mark mb-1 text-lg">Массовое заполнение</h2>
          <p className="mb-4 text-sm text-[var(--ink-soft)]">
            Смены по часам выбранного поста на период. Режим дней — будни /
            выходные / все / свои. Администраторы в список не входят.
          </p>
          <form action={bulkFillStaffShifts} className="space-y-4">
            <Field label="Пост" htmlFor="bulk-postId">
              <TextSelect id="bulk-postId" name="postId" required defaultValue="">
                <option value="" disabled>
                  Выберите пост…
                </option>
                {posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatPostHours(p.workStartHour, p.workEndHour)}
                  </option>
                ))}
              </TextSelect>
            </Field>

            <Field label="Режим дней" htmlFor="bulk-weekdayMode">
              <TextSelect
                id="bulk-weekdayMode"
                name="weekdayMode"
                defaultValue="weekdays"
              >
                <option value="weekdays">Будни (пн–пт)</option>
                <option value="weekends">Выходные (сб–вс)</option>
                <option value="all">Все дни</option>
                <option value="custom">Свои дни недели</option>
              </TextSelect>
            </Field>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-[var(--ink)]">
                Дни для режима «свои»
              </legend>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_LABELS.map((wd) => (
                  <label
                    key={wd.value}
                    className="inline-flex items-center gap-2 text-sm text-[var(--ink)]"
                  >
                    <input
                      type="checkbox"
                      name="weekday"
                      value={wd.value}
                      defaultChecked={wd.value <= 5}
                      className="size-4 accent-[var(--accent)]"
                    />
                    {wd.short}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Период с" htmlFor="bulk-fromDate">
                <TextInput
                  id="bulk-fromDate"
                  name="fromDate"
                  type="date"
                  required
                  defaultValue={toDateInputValue(periodFrom)}
                />
              </Field>
              <Field label="по" htmlFor="bulk-toDate">
                <TextInput
                  id="bulk-toDate"
                  name="toDate"
                  type="date"
                  required
                  defaultValue={toDateInputValue(periodTo)}
                />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-[var(--ink)]">
                Сотрудники
              </legend>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--line)] bg-white px-3 py-2">
                {floorProfiles.length === 0 ? (
                  <p className="text-sm text-[var(--ink-soft)]">
                    Нет активных мойщиков/слесарей
                  </p>
                ) : (
                  floorProfiles.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 text-sm text-[var(--ink)]"
                    >
                      <input
                        type="checkbox"
                        name="staffProfileId"
                        value={p.id}
                        className="size-4 accent-[var(--accent)]"
                      />
                      <span>
                        {p.user.name}
                        <span className="text-[var(--ink-soft)]">
                          {" "}
                          · {p.title}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                name="ensureAssignment"
                value="1"
                defaultChecked
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                Закрепить выбранных за постом (назначение исполнителей)
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                name="replaceExisting"
                value="1"
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                Заменять пересекающиеся смены на те же дни (иначе пропуск)
              </span>
            </label>

            <FormActions>
              <SubmitButton className="sm:w-auto">
                Заполнить период
              </SubmitButton>
            </FormActions>
          </form>
        </FormCard>

        <FormCard>
          <h2 className="brand-mark mb-1 text-lg">Замена здесь и сейчас</h2>
          <p className="mb-4 text-sm text-[var(--ink-soft)]">
            Снять с поста и поставить другого на сегодня: назначение + смена до
            конца графика поста.
          </p>
          <form action={replacePostStaffNow} className="space-y-4">
            <Field label="Пост" htmlFor="replace-postId">
              <TextSelect
                id="replace-postId"
                name="postId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Выберите пост…
                </option>
                {posts.map((p) => {
                  const onPost = assignmentsByPost.get(p.id) ?? [];
                  const names =
                    onPost.length > 0
                      ? onPost
                          .map((a) => a.staffProfile.user.name)
                          .join(", ")
                      : "никого";
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} · сейчас: {names}
                    </option>
                  );
                })}
              </TextSelect>
            </Field>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-[var(--ink)]">
                Кого снять
              </legend>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-[var(--line)] bg-white px-3 py-2">
                {openAssignments.length === 0 ? (
                  <p className="text-sm text-[var(--ink-soft)]">
                    На постах никто не закреплён
                  </p>
                ) : (
                  openAssignments.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 text-sm text-[var(--ink)]"
                    >
                      <input
                        type="checkbox"
                        name="outgoingStaffProfileId"
                        value={a.staffProfileId}
                        className="size-4 accent-[var(--accent)]"
                      />
                      <span>
                        {a.staffProfile.user.name}
                        <span className="text-[var(--ink-soft)]">
                          {" "}
                          · {a.post.name}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                name="replaceAll"
                value="1"
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>Снять всех с выбранного поста</span>
            </label>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-[var(--ink)]">
                Кто заступает
              </legend>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--line)] bg-white px-3 py-2">
                {floorProfiles.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 text-sm text-[var(--ink)]"
                  >
                    <input
                      type="checkbox"
                      name="incomingStaffProfileId"
                      value={p.id}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span>
                      {p.user.name}
                      <span className="text-[var(--ink-soft)]">
                        {" "}
                        · {p.title}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <FormActions>
              <SubmitButton className="sm:w-auto">Заменить сейчас</SubmitButton>
            </FormActions>
          </form>
        </FormCard>
      </div>

      <DataTable headers={["Сотрудник", "Пост", "Начало", "Конец", ""]}>
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
                {adminUserIds.has(s.staffProfile.userId)
                  ? "без поста"
                  : (s.post?.name ?? "—")}
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
        <h2 className="brand-mark mb-4 text-lg">Добавить одну смену</h2>
        <form action={createStaffShift} className="space-y-4">
          <Field label="Сотрудник" htmlFor="staffProfileId">
            <TextSelect id="staffProfileId" name="staffProfileId" required>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.user.name} · {p.title}
                  {adminUserIds.has(p.userId) ? " · без поста" : ""}
                </option>
              ))}
            </TextSelect>
          </Field>
          <Field
            label="Пост (мойщики/слесари; у админа игнорируется)"
            htmlFor="postId"
          >
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
