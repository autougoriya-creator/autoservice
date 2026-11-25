"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  clampPostHours,
  equalSharePercents,
} from "@/lib/payroll";
import {
  isOwner,
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

function revalidatePosts() {
  revalidatePath("/owner/posts");
  revalidatePath("/owner/staff");
  revalidatePath("/owner/schedule");
  revalidatePath("/owner/desk");
  revalidatePath("/owner/pnl");
  revalidatePath("/owner/my-work");
  revalidatePath("/client/book");
}

async function rebalanceShares(organizationId: string, postId: string) {
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

/** OWNER: часы работы конкретного поста */
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

/**
 * OWNER + ADMIN: назначить исполнителя на пост.
 * Долю % задаёт OWNER; иначе доли на посту выравниваются.
 */
export async function assignPerformerToPost(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const postId = str(formData, "postId");
  const staffProfileId = str(formData, "staffProfileId");
  const shareRaw = str(formData, "sharePercent");
  const ownerSetsShare = isOwner(session) && shareRaw !== "";

  if (!postId || !staffProfileId) throw new Error("Нужны пост и сотрудник");

  const [post, profile] = await Promise.all([
    prisma.servicePost.findFirst({ where: { id: postId, organizationId } }),
    prisma.staffProfile.findFirst({
      where: { id: staffProfileId, organizationId, isActive: true },
    }),
  ]);
  if (!post || !profile) throw new Error("Пост или профиль не найдены");

  await prisma.postAssignment.updateMany({
    where: {
      organizationId,
      postId,
      staffProfileId,
      activeTo: null,
    },
    data: { activeTo: new Date() },
  });

  const sharePercent = ownerSetsShare
    ? Math.max(0, Math.min(100, intOr(formData, "sharePercent", 100)))
    : 100;

  await prisma.postAssignment.create({
    data: {
      organizationId,
      postId,
      staffProfileId,
      sharePercent,
    },
  });

  if (!ownerSetsShare) {
    await rebalanceShares(organizationId, postId);
  }

  revalidatePosts();
  redirect("/owner/posts");
}

/** OWNER + ADMIN: снять исполнителя с поста */
export async function clearPostPerformer(formData: FormData) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const assignment = await prisma.postAssignment.findFirst({
    where: { id, organizationId, activeTo: null },
  });
  if (!assignment) {
    revalidatePosts();
    redirect("/owner/posts");
  }

  await prisma.postAssignment.updateMany({
    where: { id, organizationId, activeTo: null },
    data: { activeTo: new Date() },
  });

  await rebalanceShares(organizationId, assignment.postId);

  revalidatePosts();
  redirect("/owner/posts");
}

/** OWNER: доля вознаграждения на посту */
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
