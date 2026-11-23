"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";

function revalidateDesk() {
  revalidatePath("/owner/desk");
  revalidatePath("/owner/bookings");
  revalidatePath("/owner/work-orders");
}

export type DeskActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function moveDeskItem(input: {
  kind: "booking" | "work_order";
  id: string;
  postId: string;
  startsAtIso: string;
  durationMin?: number;
}): Promise<DeskActionResult> {
  try {
    const session = await requireStaffSession();
    const organizationId = orgIdOf(session);
    const startsAt = new Date(input.startsAtIso);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: "Некорректное время" };
    }

    const post = await prisma.servicePost.findFirst({
      where: { id: input.postId, organizationId, isActive: true },
    });
    if (!post) return { ok: false, error: "Пост не найден" };

    if (input.kind === "booking") {
      const data: {
        postId: string;
        startsAt: Date;
        durationMin?: number;
      } = { postId: input.postId, startsAt };
      if (
        typeof input.durationMin === "number" &&
        input.durationMin >= 15 &&
        input.durationMin <= 480
      ) {
        data.durationMin = Math.round(input.durationMin / 15) * 15;
      }
      const updated = await prisma.booking.updateMany({
        where: { id: input.id, organizationId },
        data,
      });
      if (updated.count === 0) return { ok: false, error: "Запись не найдена" };
    } else {
      const updated = await prisma.workOrder.updateMany({
        where: { id: input.id, organizationId },
        data: { postId: input.postId, scheduledAt: startsAt },
      });
      if (updated.count === 0) {
        return { ok: false, error: "Заказ-наряд не найден" };
      }
    }

    revalidateDesk();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить перемещение" };
  }
}

export async function updateDeskBooking(input: {
  id: string;
  postId: string;
  startsAtIso: string;
  durationMin: number;
  status: string;
  serviceName: string;
  vehicleInfo?: string;
}): Promise<DeskActionResult> {
  try {
    const session = await requireStaffSession();
    const organizationId = orgIdOf(session);
    const startsAt = new Date(input.startsAtIso);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: "Некорректное время" };
    }
    const allowed = ["PENDING", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED"];
    if (!allowed.includes(input.status)) {
      return { ok: false, error: "Некорректный статус" };
    }
    const durationMin = Math.max(
      15,
      Math.min(480, Math.round(input.durationMin / 15) * 15),
    );

    const updated = await prisma.booking.updateMany({
      where: { id: input.id, organizationId },
      data: {
        postId: input.postId,
        startsAt,
        durationMin,
        status: input.status as
          | "PENDING"
          | "CONFIRMED"
          | "IN_PROGRESS"
          | "DONE"
          | "CANCELLED",
        serviceName: input.serviceName.trim() || "Услуга",
        vehicleInfo: input.vehicleInfo?.trim() || null,
      },
    });
    if (updated.count === 0) return { ok: false, error: "Запись не найдена" };
    revalidateDesk();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить запись" };
  }
}

export async function updateDeskWorkOrder(input: {
  id: string;
  postId: string;
  startsAtIso: string;
  status: string;
}): Promise<DeskActionResult> {
  try {
    const session = await requireStaffSession();
    const organizationId = orgIdOf(session);
    const startsAt = new Date(input.startsAtIso);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: "Некорректное время" };
    }
    const allowed = ["DRAFT", "OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
    if (!allowed.includes(input.status)) {
      return { ok: false, error: "Некорректный статус" };
    }

    const updated = await prisma.workOrder.updateMany({
      where: { id: input.id, organizationId },
      data: {
        postId: input.postId,
        scheduledAt: startsAt,
        status: input.status as
          | "DRAFT"
          | "OPEN"
          | "IN_PROGRESS"
          | "DONE"
          | "CANCELLED",
        completedAt: input.status === "DONE" ? new Date() : null,
      },
    });
    if (updated.count === 0) {
      return { ok: false, error: "Заказ-наряд не найден" };
    }
    revalidateDesk();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить заказ-наряд" };
  }
}

export async function createDeskBooking(input: {
  postId: string;
  startsAtIso: string;
  durationMin: number;
  serviceName: string;
  customerId?: string;
  newCustomerName?: string;
  newCustomerPhone?: string;
  vehicleInfo?: string;
}): Promise<DeskActionResult & { id?: string }> {
  try {
    const session = await requireStaffSession();
    const organizationId = orgIdOf(session);
    const startsAt = new Date(input.startsAtIso);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: "Некорректное время" };
    }

    const post = await prisma.servicePost.findFirst({
      where: { id: input.postId, organizationId, isActive: true },
    });
    if (!post) return { ok: false, error: "Пост не найден" };

    let customer =
      input.customerId
        ? await prisma.customer.findFirst({
            where: { id: input.customerId, organizationId },
          })
        : null;

    if (!customer) {
      const name = (input.newCustomerName || "").trim();
      if (!name) return { ok: false, error: "Укажите клиента" };
      customer = await prisma.customer.create({
        data: {
          organizationId,
          name,
          phone: input.newCustomerPhone?.trim() || null,
        },
      });
    }

    const clientId = await ensureBookingUser(organizationId, customer);
    const durationMin = Math.max(
      15,
      Math.min(480, Math.round(input.durationMin / 15) * 15),
    );

    const booking = await prisma.booking.create({
      data: {
        organizationId,
        clientId,
        postId: input.postId,
        serviceName: input.serviceName.trim() || "Услуга",
        vehicleInfo: input.vehicleInfo?.trim() || null,
        startsAt,
        durationMin,
        status: "CONFIRMED",
      },
    });

    revalidateDesk();
    revalidatePath("/owner/clients");
    return { ok: true, id: booking.id };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось создать запись" };
  }
}

async function ensureBookingUser(
  organizationId: string,
  customer: { id: string; name: string; phone: string | null; userId: string | null },
) {
  if (customer.userId) return customer.userId;

  const email = `desk+${customer.id}@local.autoservice`;
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: customer.name,
      phone: customer.phone,
    },
    update: {
      name: customer.name,
      phone: customer.phone,
    },
  });

  const existing = await prisma.membership.findFirst({
    where: { organizationId, userId: user.id },
  });
  if (!existing) {
    await prisma.membership.create({
      data: { organizationId, userId: user.id, role: "CLIENT" },
    });
  }

  await prisma.customer.updateMany({
    where: { id: customer.id, organizationId },
    data: { userId: user.id },
  });

  return user.id;
}
