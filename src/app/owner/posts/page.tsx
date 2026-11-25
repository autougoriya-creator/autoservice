import {
  assignPerformerToPost,
  clearPostPerformer,
  updateAssignmentShare,
  updatePostHours,
} from "@/app/actions/posts";
import { replacePostStaffNow } from "@/app/actions/staff";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, bookingStatusLabel } from "@/lib/format";
import { formatPostHours } from "@/lib/payroll";
import { isOwner, isStaff, orgIdOf } from "@/lib/tenant";
import { SectionTitle, StatusPill, SubmitButton } from "@/components/ui";
import { Field, TextInput, TextSelect } from "@/components/forms";
import Link from "next/link";

export default async function PostsBoardPage() {
  const session = await requireSession(["OWNER", "ADMIN", "STAFF"]);
  const orgId = orgIdOf(session);
  const ownerView = isOwner(session);
  const staffView = isStaff(session);
  const canAssign = !staffView;

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

  const [posts, profiles, adminMemberships] = await Promise.all([
    prisma.servicePost.findMany({
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
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.staffProfile.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { organizationId: orgId, role: "ADMIN" },
      select: { userId: true },
    }),
  ]);
  const adminUserIds = new Set(adminMemberships.map((m) => m.userId));
  const floorProfiles = profiles.filter((p) => !adminUserIds.has(p.userId));

  return (
    <div>
      <SectionTitle
        eyebrow="Посты"
        title="Посты точки"
        description={
          staffView
            ? "График и исполнители на ваших постах. Полная загрузка — на «Мой пост»."
            : "У каждого поста своё время работы и свои исполнители (можно несколько). Доли % — у владельца. Массовое заполнение смен — в «График»."
        }
      />

      {canAssign ? (
        <p className="mb-6 text-sm text-[var(--ink-soft)]">
          <Link
            href="/owner/schedule"
            className="font-semibold text-[var(--accent)]"
          >
            Массовое заполнение и замена на графике →
          </Link>
        </p>
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
              className="flex flex-col rounded-xl border border-[var(--line)] bg-white/85 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="brand-mark text-lg text-[var(--ink)]">
                    {post.name}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    Порядок: {post.sortOrder}
                  </p>
                </div>
                <StatusPill tone={busy ? "accent" : upcoming ? "warn" : "ok"}>
                  {busy ? "Занят" : upcoming ? "Ожидает" : "Свободен"}
                </StatusPill>
              </div>

              <div className="mt-4 rounded-lg bg-[var(--paper)] px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                  График поста
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                  {formatPostHours(post.workStartHour, post.workEndHour)}
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
                  Исполнители
                </p>
                {post.postAssignments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-3 text-sm text-[var(--ink-soft)]">
                    Никто не назначен
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {post.postAssignments.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-lg border border-[var(--line)] bg-white/70 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[var(--ink)]">
                              {a.staffProfile.user.name}
                            </p>
                            <p className="text-xs text-[var(--ink-soft)]">
                              {a.staffProfile.title}
                              {a.staffProfile.payMode === "DEAL"
                                ? ` · сделка ${a.staffProfile.dealPercent}%`
                                : " · оклад"}
                            </p>
                          </div>
                          {canAssign ? (
                            <form action={clearPostPerformer}>
                              <input type="hidden" name="id" value={a.id} />
                              <button
                                type="submit"
                                className="cursor-pointer text-xs font-semibold text-red-700"
                              >
                                Снять
                              </button>
                            </form>
                          ) : null}
                        </div>
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

                {canAssign ? (
                  <form
                    action={assignPerformerToPost}
                    className="mt-2 space-y-2 rounded-lg border border-dashed border-[var(--line)] px-3 py-3"
                  >
                    <input type="hidden" name="postId" value={post.id} />
                    <Field label="Добавить исполнителя" htmlFor={`staff-${post.id}`}>
                      <TextSelect
                        id={`staff-${post.id}`}
                        name="staffProfileId"
                        required
                      >
                        <option value="">Выберите…</option>
                        {floorProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.user.name} · {p.title}
                          </option>
                        ))}
                      </TextSelect>
                    </Field>
                    {ownerView ? (
                      <Field
                        label="Доля % (пусто = поровну)"
                        htmlFor={`new-share-${post.id}`}
                      >
                        <TextInput
                          id={`new-share-${post.id}`}
                          name="sharePercent"
                          inputMode="numeric"
                          placeholder="напр. 60"
                        />
                      </Field>
                    ) : null}
                    <SubmitButton className="w-full sm:w-auto">
                      Назначить
                    </SubmitButton>
                  </form>
                ) : null}

                {canAssign ? (
                  <form
                    action={replacePostStaffNow}
                    className="mt-2 space-y-2 rounded-lg border border-[var(--line)] bg-[var(--paper)]/60 px-3 py-3"
                  >
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="replaceAll" value="1" />
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                      Замена сейчас
                    </p>
                    <Field
                      label="Кто заступает"
                      htmlFor={`replace-in-${post.id}`}
                      hint="Снимает всех текущих с поста и ставит выбранного на сегодня"
                    >
                      <TextSelect
                        id={`replace-in-${post.id}`}
                        name="incomingStaffProfileId"
                        required
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Выберите…
                        </option>
                        {floorProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.user.name} · {p.title}
                          </option>
                        ))}
                      </TextSelect>
                    </Field>
                    <SubmitButton className="w-full sm:w-auto" variant="dark">
                      Заменить на посту
                    </SubmitButton>
                  </form>
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
