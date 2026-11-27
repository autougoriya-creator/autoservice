import {
  createServicePost,
  updateAssignmentShare,
  updatePostHours,
  updateServicePost,
} from "@/app/actions/posts";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, bookingStatusLabel } from "@/lib/format";
import { formatPostHours } from "@/lib/payroll";
import { isOwner, isStaff, orgIdOf } from "@/lib/tenant";
import { SectionTitle, StatusPill, SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
} from "@/components/forms";
import Link from "next/link";

export default async function PostsBoardPage() {
  const session = await requireSession(["OWNER", "ADMIN", "STAFF"]);
  const orgId = orgIdOf(session);
  const ownerView = isOwner(session);
  const staffView = isStaff(session);

  let staffPostIds: string[] | undefined;
  if (staffView) {
    const profile = await prisma.staffProfile.findFirst({
      where: { organizationId: orgId, userId: session.id, isActive: true },
      include: {
        assignments: {
          where: { activeTo: null },
          select: { postId: true },
        },
      },
    });
    staffPostIds = profile?.assignments.map((a) => a.postId) ?? [];
  }

  const now = new Date();
  const shiftHorizon = new Date(now);
  shiftHorizon.setDate(shiftHorizon.getDate() + 14);

  const posts = await prisma.servicePost.findMany({
    where: {
      organizationId: orgId,
      ...(staffPostIds ? { id: { in: staffPostIds } } : {}),
    },
    include: {
      bookings: {
        where: {
          status: { in: ["NEW", "NEW_FROM_CLIENT", "CONFIRMED"] },
          workOrderId: null,
          startsAt: {
            gte: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
        },
        include: { client: true },
        orderBy: { startsAt: "asc" },
        take: 3,
      },
      postAssignments: {
        where: { activeTo: null },
        include: {
          staffProfile: { include: { user: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      staffShifts: {
        where: {
          startsAt: { lte: shiftHorizon },
          endsAt: { gte: now },
        },
        include: {
          staffProfile: { include: { user: true } },
        },
        orderBy: { startsAt: "asc" },
        take: 5,
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div>
      <SectionTitle
        eyebrow="Посты"
        title="Посты точки"
        description={
          staffView
            ? "Часы смены и ближайшие записи на ваших постах. Исполнители и дни работы — в «График»."
            : "Добавляйте посты, задавайте часы смены (шаблон). Дни работы и исполнители — только через календарь в «График». Запись на пост возможна, когда по графику пост в работе и на слот назначен исполнитель."
        }
      />

      {!staffView ? (
        <p className="mb-6 text-sm text-[var(--ink-soft)]">
          <Link
            href="/owner/schedule"
            className="font-semibold text-[var(--accent)]"
          >
            Календарь смен по постам →
          </Link>
        </p>
      ) : null}

      {ownerView ? (
        <FormCard className="mb-8 max-w-xl">
          <h2 className="brand-mark mb-2 text-lg">Новый пост</h2>
          <p className="mb-4 text-xs text-[var(--ink-soft)]">
            После создания назначьте смены в «График» — иначе запись на пост
            будет недоступна.
          </p>
          <form action={createServicePost} className="space-y-4">
            <Field label="Название" htmlFor="new-post-name">
              <TextInput
                id="new-post-name"
                name="name"
                required
                placeholder="Напр. Пост 4"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Смена с" htmlFor="new-start">
                <TextSelect
                  id="new-start"
                  name="workStartHour"
                  defaultValue="8"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </TextSelect>
              </Field>
              <Field label="Смена до" htmlFor="new-end">
                <TextSelect id="new-end" name="workEndHour" defaultValue="20">
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </TextSelect>
              </Field>
            </div>
            <FormActions>
              <SubmitButton className="sm:w-auto">Добавить пост</SubmitButton>
            </FormActions>
          </form>
        </FormCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {posts.map((post) => {
          const busy = post.bookings.some(
            (b) => b.status === "CONFIRMED" || b.status === "NEW_FROM_CLIENT",
          );
          const upcoming = post.bookings[0];
          const shareSum = post.postAssignments.reduce(
            (s, a) => s + a.sharePercent,
            0,
          );

          return (
            <article
              key={post.id}
              className={`flex flex-col rounded-xl border border-[var(--line)] bg-white/85 p-5 ${
                post.isActive ? "" : "opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="brand-mark text-lg text-[var(--ink)]">
                    {post.name}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    Порядок: {post.sortOrder}
                    {!post.isActive ? " · выключен" : ""}
                  </p>
                </div>
                <StatusPill tone={busy ? "accent" : upcoming ? "warn" : "ok"}>
                  {busy ? "Занят" : upcoming ? "Ожидает" : "Свободен"}
                </StatusPill>
              </div>

              {ownerView ? (
                <form
                  action={updateServicePost}
                  className="mt-4 space-y-2 rounded-lg border border-[var(--line)] px-3 py-3"
                >
                  <input type="hidden" name="postId" value={post.id} />
                  <Field label="Название" htmlFor={`name-${post.id}`}>
                    <TextInput
                      id={`name-${post.id}`}
                      name="name"
                      defaultValue={post.name}
                      required
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Порядок" htmlFor={`sort-${post.id}`}>
                      <TextInput
                        id={`sort-${post.id}`}
                        name="sortOrder"
                        inputMode="numeric"
                        defaultValue={String(post.sortOrder)}
                      />
                    </Field>
                    <Field label="Активен" htmlFor={`active-${post.id}`}>
                      <TextSelect
                        id={`active-${post.id}`}
                        name="isActive"
                        defaultValue={post.isActive ? "1" : "0"}
                      >
                        <option value="1">Да</option>
                        <option value="0">Нет</option>
                      </TextSelect>
                    </Field>
                  </div>
                  <SubmitButton className="w-full sm:w-auto">
                    Сохранить
                  </SubmitButton>
                </form>
              ) : null}

              <div className="mt-4 rounded-lg bg-[var(--paper)] px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                  Часы смены (шаблон)
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                  {formatPostHours(post.workStartHour, post.workEndHour)}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Дни работы задаются в календаре графика, не «вечным» режимом.
                </p>
                {ownerView ? (
                  <form action={updatePostHours} className="mt-3 space-y-2">
                    <input type="hidden" name="postId" value={post.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="С" htmlFor={`start-${post.id}`}>
                        <TextSelect
                          id={`start-${post.id}`}
                          name="workStartHour"
                          defaultValue={String(post.workStartHour)}
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>
                              {String(h).padStart(2, "0")}:00
                            </option>
                          ))}
                        </TextSelect>
                      </Field>
                      <Field label="До" htmlFor={`end-${post.id}`}>
                        <TextSelect
                          id={`end-${post.id}`}
                          name="workEndHour"
                          defaultValue={String(post.workEndHour)}
                        >
                          {Array.from({ length: 24 }, (_, i) => i + 1).map(
                            (h) => (
                              <option key={h} value={h}>
                                {String(h).padStart(2, "0")}:00
                              </option>
                            ),
                          )}
                        </TextSelect>
                      </Field>
                    </div>
                    <SubmitButton className="w-full sm:w-auto">
                      Сохранить часы
                    </SubmitButton>
                  </form>
                ) : null}
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                  Ближайшие смены
                </p>
                {post.staffShifts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-3 text-sm text-[var(--ink-soft)]">
                    Нет смен в ближайшие дни.{" "}
                    {!staffView ? (
                      <Link
                        href="/owner/schedule"
                        className="font-semibold text-[var(--accent)]"
                      >
                        Назначить в графике
                      </Link>
                    ) : null}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {post.staffShifts.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-lg border border-[var(--line)] bg-white/70 px-3 py-2 text-sm"
                      >
                        <p className="font-semibold text-[var(--ink)]">
                          {s.staffProfile.user.name}
                        </p>
                        <p className="text-xs text-[var(--ink-soft)]">
                          {formatDateTime(s.startsAt)} –{" "}
                          {formatDateTime(s.endsAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                  Доли ЗП (из графика)
                </p>
                {post.postAssignments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-3 text-sm text-[var(--ink-soft)]">
                    Появятся после назначения смен в графике
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {post.postAssignments.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-lg border border-[var(--line)] bg-white/70 px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          {a.staffProfile.user.name}
                        </p>
                        <p className="text-xs text-[var(--ink-soft)]">
                          {a.staffProfile.title}
                          {a.staffProfile.payMode === "DEAL"
                            ? ` · сделка ${a.staffProfile.dealPercent}%`
                            : " · оклад"}
                        </p>
                        {ownerView ? (
                          <form
                            action={updateAssignmentShare}
                            className="mt-2 flex items-end gap-2"
                          >
                            <input type="hidden" name="id" value={a.id} />
                            <div className="min-w-0 flex-1">
                              <Field label="Доля %" htmlFor={`share-${a.id}`}>
                                <TextInput
                                  id={`share-${a.id}`}
                                  name="sharePercent"
                                  inputMode="numeric"
                                  defaultValue={String(a.sharePercent)}
                                />
                              </Field>
                            </div>
                            <SubmitButton className="sm:w-auto">OK</SubmitButton>
                          </form>
                        ) : (
                          <p className="mt-1 text-xs text-[var(--ink-soft)]">
                            Доля: {a.sharePercent}%
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {ownerView &&
                post.postAssignments.length > 0 &&
                shareSum !== 100 ? (
                  <p className="text-xs font-medium text-[#9a6b16]">
                    Сумма долей {shareSum}% (желательно 100%)
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex-1 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                  Ближайшие записи
                </p>
                {post.bookings.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--ink-soft)]">
                    Нет ближайших записей
                  </p>
                ) : (
                  post.bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-lg bg-[var(--paper)] px-3 py-3"
                    >
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {booking.serviceName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">
                        {booking.client.name} · {formatDateTime(booking.startsAt)}
                      </p>
                      <p className="mt-2 text-xs font-medium text-[var(--teal)]">
                        {bookingStatusLabel[booking.status]}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
