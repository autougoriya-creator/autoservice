"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clampPostHours } from "@/lib/payroll";
import { orgIdOf, requireOwnerSession } from "@/lib/tenant";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function intOr(formData: FormData, key: string, fallback = 0) {
  const n = Number.parseInt(str(formData, key), 10);
  return Number.isFinite(n) ? n : fallback;
}

function revalidatePosts() {
  revalidatePath("/owner/posts");
  revalidatePath("/owner/staff");
  revalidatePath("/owner/schedule");
  revalidatePath("/owner/desk");
  revalidatePath("/owner/pnl");
  revalidatePath("/owner/my-work");
  revalidatePath("/client/book");
}

/** OWNER: создать новый пост */
export async function createServicePost(formData: FormData) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const name = str(formData, "name");
  if (!name) throw new Error("Укажите название поста");

  const maxSort = await prisma.servicePost.aggregate({
    where: { organizationId },
    _max: { sortOrder: true },
  });
  const sortOrder = intOr(
    formData,
    "sortOrder",
    (maxSort._max.sortOrder ?? 0) + 1,
  );
  const { workStartHour, workEndHour } = clampPostHours(
    intOr(formData, "workStartHour", 8),
    intOr(formData, "workEndHour", 20),
  );

  await prisma.servicePost.create({
    data: {
      organizationId,
      name,
      sortOrder,
      workStartHour,
      workEndHour,
      isActive: true,
    },
  });

  revalidatePosts();
  redirect("/owner/posts");
}

/** OWNER: переименовать / порядок / активность */
export async function updateServicePost(formData: FormData) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const postId = str(formData, "postId");
  const name = str(formData, "name");
  if (!postId) throw new Error("Не указан пост");
  if (!name) throw new Error("Укажите название поста");

  const sortOrder = intOr(formData, "sortOrder", 0);
  const isActive = str(formData, "isActive") !== "0";

  const updated = await prisma.servicePost.updateMany({
    where: { id: postId, organizationId },
    data: { name, sortOrder, isActive },
  });
  if (updated.count === 0) throw new Error("Пост не найден");

  revalidatePosts();
  redirect("/owner/posts");
}

/** OWNER: часы смены поста (шаблон для графика) */
export async function updatePostHours(formData: FormData) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const postId = str(formData, "postId");
  const { workStartHour, workEndHour } = clampPostHours(
    intOr(formData, "workStartHour", 8),
    intOr(formData, "workEndHour", 20),
  );

  if (!postId) throw new Error("Не указан пост");

  const updated = await prisma.servicePost.updateMany({
    where: { id: postId, organizationId },
    data: { workStartHour, workEndHour },
  });
  if (updated.count === 0) throw new Error("Пост не найден");

  revalidatePosts();
  redirect("/owner/posts");
}

/** OWNER: доля вознаграждения на посту (назначения — только из графика) */
export async function updateAssignmentShare(formData: FormData) {
  const session = await requireOwnerSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const sharePercent = Math.max(
    0,
    Math.min(100, intOr(formData, "sharePercent", 100)),
  );

  await prisma.postAssignment.updateMany({
    where: { id, organizationId, activeTo: null },
    data: { sharePercent },
  });

  revalidatePosts();
  redirect("/owner/posts");
}
