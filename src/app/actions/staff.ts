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

/**
 * Массово создать смены по графику поста:
 * пост + режим дней недели + сотрудники + период.
 */
export async function bulkFillStaffShifts(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const postId = str(formData, "postId");
  const modeRaw = str(formData, "weekdayMode") || "weekdays";
  const mode = (
    ["all", "weekdays", "weekends", "custom"].includes(modeRaw)
      ? modeRaw
      : "weekdays"
  ) as WeekdayMode;
  const from = parseDateInput(str(formData, "fromDate"));
  const to = parseDateInput(str(formData, "toDate"));
  const staffIds = formData
    .getAll("staffProfileId")
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  const customWeekdays = formData
    .getAll("weekday")
    .map((v) => (typeof v === "string" ? Number.parseInt(v, 10) : NaN))
    .filter((n) => Number.isFinite(n));
  const ensureAssignment = str(formData, "ensureAssignment") === "1";
  const replaceExisting = str(formData, "replaceExisting") === "1";

  if (!postId) throw new Error("Выберите пост");
  if (staffIds.length === 0) throw new Error("Выберите хотя бы одного сотрудника");
  if (!from || !to) throw new Error("Укажите период (даты от и до)");
  if (to < from) throw new Error("Дата «до» должна быть не раньше «от»");
  if (daysBetweenInclusive(from, to) > MAX_BULK_PERIOD_DAYS) {
    throw new Error(`Период не больше ${MAX_BULK_PERIOD_DAYS} дней`);
  }

  const weekdays = resolveWeekdays(mode, customWeekdays);
  if (weekdays.size === 0) {
    throw new Error("Выберите хотя бы один день недели");
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
    }),
  ]);
  if (!post) throw new Error("Пост не найден");
  if (profiles.length !== staffIds.length) {
    throw new Error("Не все выбранные сотрудники найдены");
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
    throw new Error("Администратора нельзя ставить на пост в массовом заполнении");
  }

  const days = enumerateMatchingDays(from, to, weekdays);
  if (days.length === 0) {
    throw new Error("В периоде нет дней по выбранному режиму");
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
      postId,
      staffProfileId: { in: staffIds },
      startsAt: { lt: periodEnd },
      endsAt: { gt: periodStart },
    },
  });

  const toCreate: {
    organizationId: string;
    staffProfileId: string;
    postId: string;
    startsAt: Date;
    endsAt: Date;
    note: string;
  }[] = [];
  const toDeleteIds: string[] = [];
  let skipped = 0;

  for (const day of days) {
    const { startsAt, endsAt } = shiftWindowForDay(
      day,
      post.workStartHour,
      post.workEndHour,
    );
    if (endsAt <= startsAt) continue;

    for (const staffProfileId of staffIds) {
      const overlaps = existing.filter(
        (s) =>
          s.staffProfileId === staffProfileId &&
          rangesOverlap(s.startsAt, s.endsAt, startsAt, endsAt),
      );
      if (overlaps.length > 0) {
        if (replaceExisting) {
          toDeleteIds.push(...overlaps.map((s) => s.id));
        } else {
          skipped += 1;
          continue;
        }
      }
      toCreate.push({
        organizationId,
        staffProfileId,
        postId,
        startsAt,
        endsAt,
        note: "Массовое заполнение",
      });
    }
  }

  if (toDeleteIds.length > 0) {
    await prisma.staffShift.deleteMany({
      where: { organizationId, id: { in: [...new Set(toDeleteIds)] } },
    });
  }

  if (toCreate.length > 0) {
    await prisma.staffShift.createMany({ data: toCreate });
  }

  if (ensureAssignment) {
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

  revalidateSchedulePaths();
  redirect(
    `/owner/schedule?bulkCreated=${toCreate.length}&bulkSkipped=${skipped}`,
  );
}

/**
 * Быстрая замена исполнителя(ей) на посту «здесь и сейчас»:
 * закрывает старые назначения, ставит новых, правит смену на сегодня.
 */
export async function replacePostStaffNow(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const postId = str(formData, "postId");
  const replaceAll = str(formData, "replaceAll") === "1";
  const outgoingIds = formData
    .getAll("outgoingStaffProfileId")
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  const incomingIds = formData
    .getAll("incomingStaffProfileId")
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());

  if (!postId) throw new Error("Выберите пост");
  if (incomingIds.length === 0) {
    throw new Error("Выберите сотрудника, который заступает");
  }

  const post = await prisma.servicePost.findFirst({
    where: { id: postId, organizationId, isActive: true },
  });
  if (!post) throw new Error("Пост не найден");

  const openAssignments = await prisma.postAssignment.findMany({
    where: { organizationId, postId, activeTo: null },
  });

  const toClose = replaceAll
    ? openAssignments
    : openAssignments.filter((a) => outgoingIds.includes(a.staffProfileId));

  if (!replaceAll && outgoingIds.length === 0 && openAssignments.length > 0) {
    throw new Error("Укажите кого снять, или включите «всех с поста»");
  }

  const incoming = await prisma.staffProfile.findMany({
    where: {
      organizationId,
      id: { in: incomingIds },
      isActive: true,
    },
  });
  if (incoming.length !== incomingIds.length) {
    throw new Error("Не все новые сотрудники найдены");
  }

  const incomingAdmins = await prisma.membership.findMany({
    where: {
      organizationId,
      role: "ADMIN",
      userId: { in: incoming.map((p) => p.userId) },
    },
    select: { userId: true },
  });
  if (incomingAdmins.length > 0) {
    throw new Error("Администратор не закрепляется за постом");
  }

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const { startsAt: postDayStart, endsAt: postDayEnd } = shiftWindowForDay(
    now,
    post.workStartHour,
    post.workEndHour,
  );

  // Закрыть назначения уходящих
  if (toClose.length > 0) {
    await prisma.postAssignment.updateMany({
      where: {
        organizationId,
        id: { in: toClose.map((a) => a.id) },
        activeTo: null,
      },
      data: { activeTo: now },
    });
  }

  // Обрезать/убрать сегодняшние смены уходящих на этом посту
  const outgoingStaffIds = [
    ...new Set(toClose.map((a) => a.staffProfileId).concat(outgoingIds)),
  ];
  if (outgoingStaffIds.length > 0) {
    const todayShifts = await prisma.staffShift.findMany({
      where: {
        organizationId,
        postId,
        staffProfileId: { in: outgoingStaffIds },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
    });
    for (const shift of todayShifts) {
      if (shift.startsAt > now) {
        await prisma.staffShift.delete({ where: { id: shift.id } });
      } else if (shift.endsAt > now) {
        await prisma.staffShift.update({
          where: { id: shift.id },
          data: { endsAt: now },
        });
      }
    }
  }

  // Назначить входящих (если ещё не на посту)
  for (const staffProfileId of incomingIds) {
    const already = await prisma.postAssignment.findFirst({
      where: {
        organizationId,
        postId,
        staffProfileId,
        activeTo: null,
      },
    });
    if (already) continue;
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

  // Смена «сейчас» для входящих до конца графика поста сегодня
  const shiftEnd =
    postDayEnd > now
      ? postDayEnd
      : (() => {
          const e = new Date(now);
          e.setHours(23, 59, 0, 0);
          return e;
        })();
  const shiftStart =
    now < postDayStart ? postDayStart : now < shiftEnd ? now : null;

  if (shiftStart && shiftEnd > shiftStart) {
    for (const staffProfileId of incomingIds) {
      const overlap = await prisma.staffShift.findFirst({
        where: {
          organizationId,
          postId,
          staffProfileId,
          startsAt: { lt: shiftEnd },
          endsAt: { gt: shiftStart },
        },
      });
      if (overlap) {
        await prisma.staffShift.update({
          where: { id: overlap.id },
          data: {
            startsAt:
              overlap.startsAt < shiftStart ? overlap.startsAt : shiftStart,
            endsAt: shiftEnd > overlap.endsAt ? shiftEnd : overlap.endsAt,
            note: overlap.note ?? "Замена здесь и сейчас",
          },
        });
      } else {
        await prisma.staffShift.create({
          data: {
            organizationId,
            staffProfileId,
            postId,
            startsAt: shiftStart,
            endsAt: shiftEnd,
            note: "Замена здесь и сейчас",
          },
        });
      }
    }
  }

  revalidateSchedulePaths();
  redirect(`/owner/schedule?replaced=1&post=${encodeURIComponent(postId)}`);
}
