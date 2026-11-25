"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { orgIdOf } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { BOARD_SNAP_MIN } from "@/lib/load-board";
import { isWithinPostHours } from "@/lib/payroll";
import { resolveServicePriceRub } from "@/lib/pricing";
import { snapDurationMin } from "@/lib/client-slots";
import { BOARD_BOOKING_STATUSES } from "@/lib/booking";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function strAll(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Самозапись из ЛК: создаёт запись со статусом NEW_FROM_CLIENT.
 * Заказ-наряд появится, когда администратор отметит «клиент приехал».
 * Поддерживает несколько услуг (serviceIds[]), как строки в ЗН.
 */
export async function createClientSelfBooking(formData: FormData) {
  const session = await requireSession(["CLIENT"]);
  const organizationId = orgIdOf(session);

  const vehicleId = str(formData, "vehicleId");
  const serviceIds = Array.from(
    new Set([
      ...strAll(formData, "serviceIds"),
      // backward-compat: single select field
      ...(str(formData, "serviceId") ? [str(formData, "serviceId")] : []),
    ]),
  );
  const startsAtIso = str(formData, "startsAtIso");
  const postId = str(formData, "postId");

  if (!vehicleId || serviceIds.length === 0 || !startsAtIso || !postId) {
    throw new Error("Выберите услуги, автомобиль и время");
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

  const [vehicle, services, post] = await Promise.all([
    prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        organizationId,
        customerId: customer.id,
      },
    }),
    prisma.service.findMany({
      where: {
        id: { in: serviceIds },
        organizationId,
        isActive: true,
      },
      include: { classPrices: true },
    }),
    prisma.servicePost.findFirst({
      where: { id: postId, organizationId, isActive: true },
    }),
  ]);

  if (!vehicle) throw new Error("Автомобиль не найден");
  if (!post) throw new Error("Пост не найден");
  if (services.length === 0) throw new Error("Услуги не найдены");
  if (services.length !== serviceIds.length) {
    throw new Error("Часть выбранных услуг недоступна");
  }

  // Preserve form order
  const ordered = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is (typeof services)[number] => Boolean(s));

  const lineData = ordered.map((service) => ({
    organizationId,
    serviceId: service.id,
    name: service.name,
    priceRub: resolveServicePriceRub(service, vehicle.vehicleClassId),
    durationMin: service.durationMin,
    quantity: 1,
  }));

  const rawDuration = lineData.reduce(
    (sum, l) => sum + l.durationMin * l.quantity,
    0,
  );
  const durationMin = snapDurationMin(rawDuration);
  const plannedAmountRub = lineData.reduce(
    (sum, l) => sum + l.priceRub * l.quantity,
    0,
  );
  const serviceName = lineData.map((l) => l.name).join(", ");

  if (
    !isWithinPostHours(
      startsAt,
      durationMin,
      post.workStartHour,
      post.workEndHour,
    )
  ) {
    const pad = (n: number) => String(n).padStart(2, "0");
    throw new Error(
      `Запись на «${post.name}» доступна с ${pad(post.workStartHour)}:00 до ${pad(post.workEndHour)}:00`,
    );
  }

  const slotEnd = startsAt.getTime() + durationMin * 60_000;
  const windowStart = new Date(startsAt.getTime() - 8 * 60 * 60_000);
  const windowEnd = new Date(slotEnd + 8 * 60 * 60_000);

  const [existingBookings, openWorkOrders] = await Promise.all([
    prisma.booking.findMany({
      where: {
        organizationId,
        postId: post.id,
        startsAt: { gte: windowStart, lte: windowEnd },
      },
      select: {
        startsAt: true,
        durationMin: true,
        status: true,
        workOrderId: true,
      },
    }),
    prisma.workOrder.findMany({
      where: {
        organizationId,
        postId: post.id,
        status: "IN_PROGRESS",
        scheduledAt: { gte: windowStart, lte: windowEnd },
      },
      select: { scheduledAt: true, lines: { select: { durationMin: true, quantity: true } } },
    }),
  ]);

  const conflictBooking = existingBookings.some((b) => {
    if (b.workOrderId) return false;
    if (!BOARD_BOOKING_STATUSES.has(String(b.status))) return false;
    const bEnd = b.startsAt.getTime() + b.durationMin * 60_000;
    return overlaps(startsAt.getTime(), slotEnd, b.startsAt.getTime(), bEnd);
  });
  if (conflictBooking) {
    throw new Error("Это время уже занято. Выберите другой слот.");
  }

  const conflictWo = openWorkOrders.some((wo) => {
    if (!wo.scheduledAt) return false;
    const dur = Math.max(
      15,
      wo.lines.reduce((s, l) => s + l.durationMin * l.quantity, 0),
    );
    const woEnd = wo.scheduledAt.getTime() + dur * 60_000;
    return overlaps(
      startsAt.getTime(),
      slotEnd,
      wo.scheduledAt.getTime(),
      woEnd,
    );
  });
  if (conflictWo) {
    throw new Error("Это время уже занято. Выберите другой слот.");
  }

  const vehicleInfo = `${vehicle.make} ${vehicle.model} · ${vehicle.plate}`;

  const booking = await prisma.booking.create({
    data: {
      organizationId,
      clientId: session.id,
      customerId: customer.id,
      postId: post.id,
      serviceName,
      plannedAmountRub,
      vehicleInfo,
      vehicleId: vehicle.id,
      startsAt,
      durationMin,
      status: "NEW_FROM_CLIENT",
      fromClient: true,
      lines: {
        create: lineData,
      },
    },
  });

  revalidatePath("/client");
  revalidatePath("/client/book");
  revalidatePath("/client/orders");
  revalidatePath("/owner/bookings");
  revalidatePath("/owner/desk");
  revalidatePath("/owner/planned");
  redirect(`/client?booked=${booking.id}`);
}
