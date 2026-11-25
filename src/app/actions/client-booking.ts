"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { orgIdOf } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  BOARD_END_HOUR,
  BOARD_SNAP_MIN,
  BOARD_START_HOUR,
} from "@/lib/load-board";
import { resolveServicePriceRub } from "@/lib/pricing";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Самозапись из ЛК: создаёт заказ-наряд со статусом NEW_FROM_CLIENT.
 * Телефон клиента уже известен через связку User → Customer.
 */
export async function createClientSelfBooking(formData: FormData) {
  const session = await requireSession(["CLIENT"]);
  const organizationId = orgIdOf(session);

  const vehicleId = str(formData, "vehicleId");
  const serviceId = str(formData, "serviceId");
  const startsAtIso = str(formData, "startsAtIso");
  const postId = str(formData, "postId");
  const notes = str(formData, "notes") || null;

  if (!vehicleId || !serviceId || !startsAtIso) {
    throw new Error("Выберите услугу, автомобиль и время");
  }

  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("Некорректное время записи");
  }
  if (startsAt.getTime() < Date.now() - 60_000) {
    throw new Error("Нельзя записаться на прошедшее время");
  }

  const minutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const dayStart = BOARD_START_HOUR * 60;
  const dayEnd = BOARD_END_HOUR * 60;
  if (minutes < dayStart || minutes >= dayEnd) {
    throw new Error("Запись доступна с 08:00 до 20:00");
  }
  if (minutes % BOARD_SNAP_MIN !== 0) {
    throw new Error("Время записи должно быть кратно 15 минутам");
  }

  const customer = await prisma.customer.findFirst({
    where: { organizationId, userId: session.id },
  });
  if (!customer) {
    throw new Error("Профиль клиента не найден. Обратитесь в точку.");
  }

  const [vehicle, service, post] = await Promise.all([
    prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        organizationId,
        customerId: customer.id,
      },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, organizationId, isActive: true },
      include: { classPrices: true },
    }),
    postId
      ? prisma.servicePost.findFirst({
          where: { id: postId, organizationId, isActive: true },
        })
      : prisma.servicePost.findFirst({
          where: { organizationId, isActive: true },
          orderBy: { sortOrder: "asc" },
        }),
  ]);

  if (!vehicle) throw new Error("Автомобиль не найден");
  if (!service) throw new Error("Услуга не найдена");
  if (!post) throw new Error("Нет свободных постов");

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { workOrderSeq: { increment: 1 } },
  });

  const workOrder = await prisma.workOrder.create({
    data: {
      organizationId,
      number: updated.workOrderSeq,
      status: "NEW_FROM_CLIENT",
      customerId: customer.id,
      vehicleId: vehicle.id,
      postId: post.id,
      scheduledAt: startsAt,
      notes,
      lines: {
        create: [
          {
            serviceId: service.id,
            name: service.name,
            priceRub: resolveServicePriceRub(
              service,
              vehicle.vehicleClassId,
            ),
            durationMin: service.durationMin,
            quantity: 1,
          },
        ],
      },
    },
  });

  revalidatePath("/client");
  revalidatePath("/client/book");
  revalidatePath("/client/orders");
  revalidatePath("/owner/work-orders");
  revalidatePath("/owner/desk");
  revalidatePath("/owner/planned");
  redirect(`/client/orders?created=${workOrder.id}`);
}
