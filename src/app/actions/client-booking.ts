"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { orgIdOf } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { BOARD_SNAP_MIN } from "@/lib/load-board";
import { isWithinPostHours } from "@/lib/payroll";
import { resolveServicePriceRub } from "@/lib/pricing";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Самозапись из ЛК: создаёт запись со статусом NEW_FROM_CLIENT.
 * Заказ-наряд появится, когда администратор отметит «клиент приехал».
 */
export async function createClientSelfBooking(formData: FormData) {
  const session = await requireSession(["CLIENT"]);
  const organizationId = orgIdOf(session);

  const vehicleId = str(formData, "vehicleId");
  const serviceId = str(formData, "serviceId");
  const startsAtIso = str(formData, "startsAtIso");
  const postId = str(formData, "postId");

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

  if (
    !isWithinPostHours(
      startsAt,
      service.durationMin,
      post.workStartHour,
      post.workEndHour,
    )
  ) {
    const pad = (n: number) => String(n).padStart(2, "0");
    throw new Error(
      `Запись на «${post.name}» доступна с ${pad(post.workStartHour)}:00 до ${pad(post.workEndHour)}:00`,
    );
  }

  const priceRub = resolveServicePriceRub(service, vehicle.vehicleClassId);
  const vehicleInfo = `${vehicle.make} ${vehicle.model} · ${vehicle.plate}`;

  const booking = await prisma.booking.create({
    data: {
      organizationId,
      clientId: session.id,
      customerId: customer.id,
      postId: post.id,
      serviceName: service.name,
      plannedAmountRub: priceRub,
      vehicleInfo,
      vehicleId: vehicle.id,
      startsAt,
      durationMin: service.durationMin,
      status: "NEW_FROM_CLIENT",
      lines: {
        create: [
          {
            organizationId,
            serviceId: service.id,
            name: service.name,
            priceRub,
            durationMin: service.durationMin,
            quantity: 1,
          },
        ],
      },
    },
  });

  revalidatePath("/client");
  revalidatePath("/client/book");
  revalidatePath("/owner/bookings");
  revalidatePath("/owner/desk");
  revalidatePath("/owner/planned");
  redirect(`/client?booked=${booking.id}`);
}
