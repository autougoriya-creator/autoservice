"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
    where: { organizationId, userId, role: "STAFF" },
  });
  if (!membership) throw new Error("Пользователь не в роли персонала");

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
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const postId = str(formData, "postId");
  const staffProfileId = str(formData, "staffProfileId");
  if (!postId || !staffProfileId) throw new Error("Нужны пост и сотрудник");

  const [post, profile] = await Promise.all([
    prisma.servicePost.findFirst({ where: { id: postId, organizationId } }),
    prisma.staffProfile.findFirst({ where: { id: staffProfileId, organizationId } }),
  ]);
  if (!post || !profile) throw new Error("Пост или профиль не найдены");

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
    data: { organizationId, postId, staffProfileId },
  });

  revalidatePath("/owner/staff");
  revalidatePath("/owner/schedule");
  revalidatePath("/owner/pnl");
  redirect("/owner/staff");
}

export async function clearPostAssignment(formData: FormData) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  await prisma.postAssignment.updateMany({
    where: { id, organizationId, activeTo: null },
    data: { activeTo: new Date() },
  });
  revalidatePath("/owner/staff");
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

  await prisma.staffShift.create({
    data: {
      organizationId,
      staffProfileId,
      postId,
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
