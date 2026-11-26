"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { equalSharePercents } from "@/lib/payroll";
import {
  MAX_BULK_PERIOD_DAYS,
  daysBetweenInclusive,
  enumerateMatchingDays,
  parseDateInput,
  rangesOverlap,
  resolveWeekdays,
  shiftWindowForDay,
  type WeekdayMode,
} from "@/lib/schedule-fill";
import {
  orgIdOf,
  requireManagementSession,
  requireOwnerSession,
} from "@/lib/tenant";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function intOr(formData: FormData, key: string, fallback = 0) {
  const n = Number.parseInt(str(formData, key), 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function updateAdminUpsellBonusPercent(formData: FormData) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const percent = Math.max(
    0,
    Math.min(100, intOr(formData, "adminUpsellBonusPercent", 0)),
  );

  await prisma.organization.update({
    where: { id: organizationId },
    data: { adminUpsellBonusPercent: percent },
  });

  revalidatePath("/owner/staff");
  revalidatePath("/owner/pnl");
  revalidatePath("/owner/my-work");
  redirect("/owner/staff");
}

export async function upsertStaffProfile(formData: FormData) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const userId = str(formData, "userId");
  const title = str(formData, "title") || "Мойщик";
  const payMode = str(formData, "payMode") === "SALARY" ? "SALARY" : "DEAL";
  const dealPercent = Math.max(0, Math.min(100, intOr(formData, "dealPercent", 30)));
  const salaryRub = Math.max(0, intOr(formData, "salaryRub", 0));
  const isActive = str(formData, "isActive") !== "0";

  if (!userId) throw new Error("Выберите сотрудника");

  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      userId,
      role: { in: ["STAFF", "ADMIN"] },
    },
  });
  if (!membership) throw new Error("Пользователь не в роли персонала или администратора");

  if (id) {
    await prisma.staffProfile.updateMany({
      where: { id, organizationId },
      data: { title, payMode, dealPercent, salaryRub, isActive },
    });
  } else {
    const existing = await prisma.staffProfile.findFirst({
      where: { organizationId, userId },
    });
    if (existing) {
      await prisma.staffProfile.updateMany({
        where: { id: existing.id, organizationId },
        data: { title, payMode, dealPercent, salaryRub, isActive },
      });
    } else {
      await prisma.staffProfile.create({
        data: {
          organizationId,
          userId,
          title,
          payMode,
          dealPercent,
          salaryRub,
          isActive,
        },
      });
    }
  }

  revalidatePath("/owner/staff");
  revalidatePath("/owner/pnl");
  revalidatePath("/owner/my-work");
  redirect("/owner/staff");
}

export async function assignStaffToPost(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const postId = str(formData, "postId");
  const staffProfileId = str(formData, "staffProfileId");
  if (!postId || !staffProfileId) throw new Error("Нужны пост и сотрудник");

  const [post, profile] = await Promise.all([
    prisma.servicePost.findFirst({ where: { id: postId, organizationId } }),
    prisma.staffProfile.findFirst({ where: { id: staffProfileId, organizationId } }),
  ]);
  if (!post || !profile) throw new Error("Пост или профиль не найдены");

  const membership = await prisma.membership.findFirst({
    where: { organizationId, userId: profile.userId },
    select: { role: true },
  });
  if (membership?.role === "ADMIN") {
    throw new Error("Администратор не закрепляется за постом");
  }

  // Close previous open assignment for this post+staff
  await prisma.postAssignment.updateMany({
    where: {
      organizationId,
      postId,
      staffProfileId,
      activeTo: null,
    },
    data: { activeTo: new Date() },
  });

  await prisma.postAssignment.create({
    data: { organizationId, postId, staffProfileId, sharePercent: 100 },
  });

  const open = await prisma.postAssignment.findMany({
    where: { organizationId, postId, activeTo: null },
    orderBy: { createdAt: "asc" },
  });
  const shares = equalSharePercents(open.length);
  await Promise.all(
    open.map((a, i) =>
      prisma.postAssignment.update({
        where: { id: a.id },
        data: { sharePercent: shares[i] },
      }),
    ),
  );

  revalidatePath("/owner/staff");
  revalidatePath("/owner/posts");
  revalidatePath("/owner/schedule");
  revalidatePath("/owner/pnl");
  redirect("/owner/staff");
}

export async function clearPostAssignment(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const assignment = await prisma.postAssignment.findFirst({
    where: { id, organizationId, activeTo: null },
  });
  await prisma.postAssignment.updateMany({
    where: { id, organizationId, activeTo: null },
    data: { activeTo: new Date() },
  });
  if (assignment) {
    const open = await prisma.postAssignment.findMany({
      where: {
        organizationId,
        postId: assignment.postId,
        activeTo: null,
      },
      orderBy: { createdAt: "asc" },
    });
    const shares = equalSharePercents(open.length);
    await Promise.all(
      open.map((a, i) =>
        prisma.postAssignment.update({
          where: { id: a.id },
          data: { sharePercent: shares[i] },
        }),
      ),
    );
  }
  revalidatePath("/owner/staff");
  revalidatePath("/owner/posts");
  revalidatePath("/owner/pnl");
  redirect("/owner/staff");
}

export async function createStaffShift(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const staffProfileId = str(formData, "staffProfileId");
  const postId = str(formData, "postId") || null;
  const startsAt = new Date(str(formData, "startsAt"));
  const endsAt = new Date(str(formData, "endsAt"));
  const note = str(formData, "note") || null;

  if (!staffProfileId || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error("Заполните сотрудника и время смены");
  }
  if (endsAt <= startsAt) throw new Error("Конец смены должен быть позже начала");

  const profile = await prisma.staffProfile.findFirst({
    where: { id: staffProfileId, organizationId },
  });
  if (!profile) throw new Error("Профиль не найден");

  const membership = await prisma.membership.findFirst({
    where: { organizationId, userId: profile.userId },
    select: { role: true },
  });
  // Админ работает сменой без поста (бонус — от закрытых ЗН за смену).
  const resolvedPostId = membership?.role === "ADMIN" ? null : postId;

  await prisma.staffShift.create({
    data: {
      organizationId,
      staffProfileId,
      postId: resolvedPostId,
      startsAt,
      endsAt,
      note,
    },
  });

  revalidatePath("/owner/schedule");
  revalidatePath("/owner/my-work");
  revalidatePath("/owner/pnl");
  redirect("/owner/schedule");
}

export async function deleteStaffShift(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  await prisma.staffShift.deleteMany({ where: { id, organizationId } });
  revalidatePath("/owner/schedule");
  revalidatePath("/owner/my-work");
  redirect("/owner/schedule");
}

function revalidateSchedulePaths() {
  revalidatePath("/owner/schedule");
  revalidatePath("/owner/posts");
  revalidatePath("/owner/staff");
  revalidatePath("/owner/my-work");
  revalidatePath("/owner/pnl");
  revalidatePath("/owner/desk");
}

async function rebalancePostShares(organizationId: string, postId: string) {
  const open = await prisma.postAssignment.findMany({
    where: { organizationId, postId, activeTo: null },
    orderBy: { createdAt: "asc" },
  });
  if (open.length === 0) return;
  const shares = equalSharePercents(open.length);
  await Promise.all(
    open.map((a, i) =>
      prisma.postAssignment.update({
        where: { id: a.id },
        data: { sharePercent: shares[i] },
      }),
    ),
  );
}

export type BulkFillInput = {
  postId: string;
  weekdayMode: WeekdayMode;
  customWeekdays?: number[];
  fromDate: string;
  toDate: string;
  staffProfileIds: string[];
};

export type BulkFillConflict = {
  staffProfileId: string;
  staffName: string;
  dayKey: string;
  existingPostName: string | null;
  existingStartsAt: string;
  existingEndsAt: string;
  plannedStartsAt: string;
  plannedEndsAt: string;
};

export type BulkFillPreviewResult =
  | {
      ok: true;
      plannedCount: number;
      conflicts: BulkFillConflict[];
    }
  | { ok: false; error: string };

export type BulkFillApplyResult =
  | { ok: true; created: number; replaced: number }
  | { ok: false; error: string; conflicts?: BulkFillConflict[] };

type PreparedBulkFill = {
  organizationId: string;
  postId: string;
  staffIds: string[];
  days: Date[];
  post: { workStartHour: number; workEndHour: number; name: string };
  profileNames: Map<string, string>;
  existing: {
    id: string;
    staffProfileId: string;
    startsAt: Date;
    endsAt: Date;
    post: { name: string } | null;
  }[];
};

function toDateInputKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function prepareBulkFill(
  input: BulkFillInput,
): Promise<{ ok: true; data: PreparedBulkFill } | { ok: false; error: string }> {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const postId = input.postId?.trim() ?? "";
  const mode = (
    ["all", "weekdays", "weekends", "custom"].includes(input.weekdayMode)
      ? input.weekdayMode
      : "weekdays"
  ) as WeekdayMode;
  const from = parseDateInput(input.fromDate);
  const to = parseDateInput(input.toDate);
  const staffIds = [...new Set(input.staffProfileIds.map((id) => id.trim()).filter(Boolean))];
  const customWeekdays = (input.customWeekdays ?? []).filter(
    (n) => Number.isFinite(n) && n >= 1 && n <= 7,
  );

  if (!postId) return { ok: false, error: "Выберите пост" };
  if (staffIds.length === 0) {
    return { ok: false, error: "Выберите хотя бы одного сотрудника" };
  }
  if (!from || !to) return { ok: false, error: "Укажите период (даты от и до)" };
  if (to < from) {
    return { ok: false, error: "Дата «до» должна быть не раньше «от»" };
  }
  if (daysBetweenInclusive(from, to) > MAX_BULK_PERIOD_DAYS) {
    return { ok: false, error: `Период не больше ${MAX_BULK_PERIOD_DAYS} дней` };
  }

  const weekdays = resolveWeekdays(mode, customWeekdays);
  if (weekdays.size === 0) {
    return { ok: false, error: "Выберите хотя бы один день недели" };
  }

  const [post, profiles] = await Promise.all([
    prisma.servicePost.findFirst({
      where: { id: postId, organizationId, isActive: true },
    }),
    prisma.staffProfile.findMany({
      where: {
        organizationId,
        id: { in: staffIds },
        isActive: true,
      },
      include: { user: { select: { name: true } } },
    }),
  ]);
  if (!post) return { ok: false, error: "Пост не найден" };
  if (profiles.length !== staffIds.length) {
    return { ok: false, error: "Не все выбранные сотрудники найдены" };
  }

  const adminMemberships = await prisma.membership.findMany({
    where: {
      organizationId,
      role: "ADMIN",
      userId: { in: profiles.map((p) => p.userId) },
    },
    select: { userId: true },
  });
  if (adminMemberships.length > 0) {
    return {
      ok: false,
      error: "Администратора нельзя ставить на пост в массовом заполнении",
    };
  }

  const days = enumerateMatchingDays(from, to, weekdays);
  if (days.length === 0) {
    return { ok: false, error: "В периоде нет дней по выбранному режиму" };
  }

  const periodStart = shiftWindowForDay(
    days[0],
    post.workStartHour,
    post.workEndHour,
  ).startsAt;
  const periodEnd = shiftWindowForDay(
    days[days.length - 1],
    post.workStartHour,
    post.workEndHour,
  ).endsAt;

  const existing = await prisma.staffShift.findMany({
    where: {
      organizationId,
      staffProfileId: { in: staffIds },
      startsAt: { lt: periodEnd },
      endsAt: { gt: periodStart },
    },
    include: { post: { select: { name: true } } },
  });

  const profileNames = new Map(
    profiles.map((p) => [p.id, p.user.name] as const),
  );

  return {
    ok: true,
    data: {
      organizationId,
      postId,
      staffIds,
      days,
      post: {
        workStartHour: post.workStartHour,
        workEndHour: post.workEndHour,
        name: post.name,
      },
      profileNames,
      existing,
    },
  };
}

function collectBulkPlan(data: PreparedBulkFill) {
  const conflicts: BulkFillConflict[] = [];
  const toCreate: {
    organizationId: string;
    staffProfileId: string;
    postId: string;
    startsAt: Date;
    endsAt: Date;
    note: string;
  }[] = [];
  const toDeleteIds: string[] = [];

  for (const day of data.days) {
    const { startsAt, endsAt } = shiftWindowForDay(
      day,
      data.post.workStartHour,
      data.post.workEndHour,
    );
    if (endsAt <= startsAt) continue;
    const dayKey = toDateInputKey(day);

    for (const staffProfileId of data.staffIds) {
      const overlaps = data.existing.filter(
        (s) =>
          s.staffProfileId === staffProfileId &&
          rangesOverlap(s.startsAt, s.endsAt, startsAt, endsAt),
      );
      for (const overlap of overlaps) {
        conflicts.push({
          staffProfileId,
          staffName: data.profileNames.get(staffProfileId) ?? "Сотрудник",
          dayKey,
          existingPostName: overlap.post?.name ?? null,
          existingStartsAt: overlap.startsAt.toISOString(),
          existingEndsAt: overlap.endsAt.toISOString(),
          plannedStartsAt: startsAt.toISOString(),
          plannedEndsAt: endsAt.toISOString(),
        });
        toDeleteIds.push(overlap.id);
      }
      toCreate.push({
        organizationId: data.organizationId,
        staffProfileId,
        postId: data.postId,
        startsAt,
        endsAt,
        note: "Массовое заполнение",
      });
    }
  }

  return {
    conflicts,
    toCreate,
    toDeleteIds: [...new Set(toDeleteIds)],
  };
}

async function ensurePostAssignments(
  organizationId: string,
  postId: string,
  staffIds: string[],
) {
  for (const staffProfileId of staffIds) {
    const open = await prisma.postAssignment.findFirst({
      where: {
        organizationId,
        postId,
        staffProfileId,
        activeTo: null,
      },
    });
    if (open) continue;
    await prisma.postAssignment.create({
      data: {
        organizationId,
        postId,
        staffProfileId,
        sharePercent: 100,
      },
    });
  }
  await rebalancePostShares(organizationId, postId);
}

/** Проверка пересечений перед записью графика. */
export async function previewBulkFillStaffShifts(
  input: BulkFillInput,
): Promise<BulkFillPreviewResult> {
  try {
    const prepared = await prepareBulkFill(input);
    if (!prepared.ok) return prepared;
    const plan = collectBulkPlan(prepared.data);
    return {
      ok: true,
      plannedCount: plan.toCreate.length,
      conflicts: plan.conflicts,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось проверить график",
    };
  }
}

/**
 * Записать смены по посту на период.
 * При conflicts и replaceExisting=false — не пишет, возвращает список.
 * Всегда обновляет PostAssignment выбранных (без галочки в UI).
 */
export async function applyBulkFillStaffShifts(
  input: BulkFillInput & { replaceExisting: boolean },
): Promise<BulkFillApplyResult> {
  try {
    const prepared = await prepareBulkFill(input);
    if (!prepared.ok) return prepared;
    const plan = collectBulkPlan(prepared.data);

    if (plan.conflicts.length > 0 && !input.replaceExisting) {
      return {
        ok: false,
        error: "Есть пересечения с текущим графиком",
        conflicts: plan.conflicts,
      };
    }

    if (input.replaceExisting && plan.toDeleteIds.length > 0) {
      await prisma.staffShift.deleteMany({
        where: {
          organizationId: prepared.data.organizationId,
          id: { in: plan.toDeleteIds },
        },
      });
    }

    const toCreate =
      input.replaceExisting || plan.conflicts.length === 0
        ? plan.toCreate
        : [];

    // Без replace создаём только дни без пересечений — но сюда не доходим
    // при conflicts (см. выше). При replace — полный план.
    if (toCreate.length > 0) {
      await prisma.staffShift.createMany({ data: toCreate });
    }

    await ensurePostAssignments(
      prepared.data.organizationId,
      prepared.data.postId,
      prepared.data.staffIds,
    );

    revalidateSchedulePaths();
    return {
      ok: true,
      created: toCreate.length,
      replaced: input.replaceExisting ? plan.toDeleteIds.length : 0,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось заполнить график",
    };
  }
}

export type ScheduleBoardActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Перенос смены на другой пост/день (часы — по графику целевого поста).
 * Для визуальной месячной доски; с подтверждением на клиенте.
 */
export async function moveStaffShiftOnBoard(input: {
  id: string;
  postId: string;
  dayKey: string;
}): Promise<ScheduleBoardActionResult> {
  try {
    const session = await requireManagementSession();
    const organizationId = orgIdOf(session);
    const day = parseDateInput(input.dayKey);
    if (!day) return { ok: false, error: "Некорректная дата" };

    const [shift, post] = await Promise.all([
      prisma.staffShift.findFirst({
        where: { id: input.id, organizationId },
        include: {
          staffProfile: { select: { userId: true } },
        },
      }),
      prisma.servicePost.findFirst({
        where: { id: input.postId, organizationId, isActive: true },
      }),
    ]);
    if (!shift) return { ok: false, error: "Смена не найдена" };
    if (!post) return { ok: false, error: "Пост не найден" };

    const membership = await prisma.membership.findFirst({
      where: { organizationId, userId: shift.staffProfile.userId },
      select: { role: true },
    });
    if (membership?.role === "ADMIN") {
      return { ok: false, error: "Смену администратора нельзя ставить на пост" };
    }

    const { startsAt, endsAt } = shiftWindowForDay(
      day,
      post.workStartHour,
      post.workEndHour,
    );
    if (endsAt <= startsAt) {
      return { ok: false, error: "Некорректные часы поста" };
    }

    const conflict = await prisma.staffShift.findFirst({
      where: {
        organizationId,
        staffProfileId: shift.staffProfileId,
        id: { not: shift.id },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (conflict) {
      return {
        ok: false,
        error: "У сотрудника уже есть смена, пересекающаяся с этим днём",
      };
    }

    await prisma.staffShift.update({
      where: { id: shift.id },
      data: {
        postId: post.id,
        startsAt,
        endsAt,
      },
    });

    revalidateSchedulePaths();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось перенести смену",
    };
  }
}

/** Создать смену на доске (пост + день + сотрудник). */
export async function createStaffShiftOnBoard(input: {
  staffProfileId: string;
  postId: string;
  dayKey: string;
  note?: string;
}): Promise<ScheduleBoardActionResult & { id?: string }> {
  try {
    const session = await requireManagementSession();
    const organizationId = orgIdOf(session);
    const day = parseDateInput(input.dayKey);
    if (!day) return { ok: false, error: "Некорректная дата" };

    const [profile, post] = await Promise.all([
      prisma.staffProfile.findFirst({
        where: {
          id: input.staffProfileId,
          organizationId,
          isActive: true,
        },
      }),
      prisma.servicePost.findFirst({
        where: { id: input.postId, organizationId, isActive: true },
      }),
    ]);
    if (!profile) return { ok: false, error: "Сотрудник не найден" };
    if (!post) return { ok: false, error: "Пост не найден" };

    const membership = await prisma.membership.findFirst({
      where: { organizationId, userId: profile.userId },
      select: { role: true },
    });
    if (membership?.role === "ADMIN") {
      return { ok: false, error: "Администратора нельзя ставить на пост" };
    }

    const { startsAt, endsAt } = shiftWindowForDay(
      day,
      post.workStartHour,
      post.workEndHour,
    );
    if (endsAt <= startsAt) {
      return { ok: false, error: "Некорректные часы поста" };
    }

    const conflict = await prisma.staffShift.findFirst({
      where: {
        organizationId,
        staffProfileId: profile.id,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (conflict) {
      return {
        ok: false,
        error: "У сотрудника уже есть смена в этот день",
      };
    }

    const created = await prisma.staffShift.create({
      data: {
        organizationId,
        staffProfileId: profile.id,
        postId: post.id,
        startsAt,
        endsAt,
        note: input.note?.trim() || null,
      },
    });

    revalidateSchedulePaths();
    return { ok: true, id: created.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось создать смену",
    };
  }
}

/** Удалить смену с доски (без redirect). */
export async function deleteStaffShiftOnBoard(input: {
  id: string;
}): Promise<ScheduleBoardActionResult> {
  try {
    const session = await requireManagementSession();
    const organizationId = orgIdOf(session);
    const result = await prisma.staffShift.deleteMany({
      where: { id: input.id, organizationId },
    });
    if (result.count === 0) return { ok: false, error: "Смена не найдена" };
    revalidateSchedulePaths();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось удалить смену",
    };
  }
}
