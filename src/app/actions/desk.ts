"use server";

import { revalidatePath } from "next/cache";
import type { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canCreateWorkOrderFromBooking,
  canTransitionBookingStatus,
  selectableBookingStatuses,
} from "@/lib/booking";
import {
  bookingLinesDuration,
  bookingLinesTotal,
  normalizePlannedLines,
  summarizeServiceNames,
  type PlannedLineInput,
} from "@/lib/booking-plan";
import { normalizePhone } from "@/lib/phone";
import { isWithinPostHours } from "@/lib/payroll";
import { assertPostSlotBookable } from "@/lib/post-booking-gate";
import { resolveServicePriceRub } from "@/lib/pricing";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
import { applyNormWriteoff } from "@/lib/warehouse";
import { canTransitionWorkOrderStatus } from "@/lib/work-order";

function postHoursError(
  startsAt: Date,
  durationMin: number,
  post: { workStartHour: number; workEndHour: number; name: string },
) {
  if (
    isWithinPostHours(
      startsAt,
      durationMin,
      post.workStartHour,
      post.workEndHour,
    )
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Время вне шаблона смены «${post.name}» (${pad(post.workStartHour)}:00–${pad(post.workEndHour)}:00)`;
}

/** Часы шаблона + смена с исполнителем на слот. */
async function postBookingGateError(
  organizationId: string,
  post: {
    id: string;
    name: string;
    workStartHour: number;
    workEndHour: number;
  },
  startsAt: Date,
  durationMin: number,
) {
  const hoursErr = postHoursError(startsAt, durationMin, post);
  if (hoursErr) return hoursErr;
  return assertPostSlotBookable(organizationId, post, startsAt, durationMin);
}

function revalidateDesk() {
  revalidatePath("/owner/desk");
  revalidatePath("/owner/bookings");
  revalidatePath("/owner/work-orders");
  revalidatePath("/owner/planned");
  revalidatePath("/client");
  revalidatePath("/client/book");
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
    const session = await requireManagementSession();
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
      const existing = await prisma.booking.findFirst({
        where: { id: input.id, organizationId },
        select: { durationMin: true },
      });
      if (!existing) return { ok: false, error: "Запись не найдена" };
      const data: {
        postId: string;
        startsAt: Date;
        durationMin?: number;
      } = { postId: input.postId, startsAt };
      let durationMin = existing.durationMin;
      if (
        typeof input.durationMin === "number" &&
        input.durationMin >= 15 &&
        input.durationMin <= 480
      ) {
        data.durationMin = Math.round(input.durationMin / 15) * 15;
        durationMin = data.durationMin;
      }
      const gateErr = await postBookingGateError(
        organizationId,
        post,
        startsAt,
        durationMin,
      );
      if (gateErr) return { ok: false, error: gateErr };
      const updated = await prisma.booking.updateMany({
        where: { id: input.id, organizationId },
        data,
      });
      if (updated.count === 0) return { ok: false, error: "Запись не найдена" };
    } else {
      const gateErr = await postBookingGateError(
        organizationId,
        post,
        startsAt,
        60,
      );
      if (gateErr) return { ok: false, error: gateErr };
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
  durationMin?: number;
  status: string;
  serviceName?: string;
  vehicleInfo?: string;
  plannedAmountRub?: number;
  lines?: PlannedLineInput[];
}): Promise<DeskActionResult> {
  try {
    const session = await requireManagementSession();
    const organizationId = orgIdOf(session);
    const startsAt = new Date(input.startsAtIso);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: "Некорректное время" };
    }
    const nextStatus = input.status as BookingStatus;
    if (!["NEW", "NEW_FROM_CLIENT", "CONFIRMED"].includes(nextStatus)) {
      return {
        ok: false,
        error: "Отмену записи делайте отдельной кнопкой с указанием причины",
      };
    }

    const existing = await prisma.booking.findFirst({
      where: { id: input.id, organizationId },
    });
    if (!existing) return { ok: false, error: "Запись не найдена" };
    if (existing.status === "CANCELLED") {
      return { ok: false, error: "Отменённую запись нельзя изменить" };
    }
    if (existing.workOrderId) {
      return {
        ok: false,
        error: "По записи уже создан заказ-наряд — правьте карточку ЗН",
      };
    }
    if (!canTransitionBookingStatus(existing.status, nextStatus)) {
      return {
        ok: false,
        error: "Недопустимый переход статуса записи",
      };
    }

    const post = await prisma.servicePost.findFirst({
      where: { id: input.postId, organizationId, isActive: true },
    });
    if (!post) return { ok: false, error: "Пост не найден" };

    const lines = input.lines ? normalizePlannedLines(input.lines) : null;
    const catalogTotal = lines ? bookingLinesTotal(lines) : null;
    const durationMin = Math.max(
      15,
      Math.min(
        480,
        Math.round(
          (lines
            ? bookingLinesDuration(lines)
            : (input.durationMin ?? existing.durationMin)) / 15,
        ) * 15,
      ),
    );
    const gateErr = await postBookingGateError(
      organizationId,
      post,
      startsAt,
      durationMin,
    );
    if (gateErr) return { ok: false, error: gateErr };
    const plannedAmountRub =
      typeof input.plannedAmountRub === "number"
        ? Math.max(0, Math.round(input.plannedAmountRub))
        : (catalogTotal ?? existing.plannedAmountRub);
    const serviceName = lines
      ? summarizeServiceNames(lines)
      : (input.serviceName?.trim() || existing.serviceName || "Услуга");

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: existing.id },
        data: {
          postId: input.postId,
          startsAt,
          durationMin,
          status: nextStatus,
          serviceName,
          plannedAmountRub,
          vehicleInfo: input.vehicleInfo?.trim() || null,
        },
      });
      if (lines) {
        await tx.bookingLine.deleteMany({ where: { bookingId: existing.id } });
        if (lines.length > 0) {
          await tx.bookingLine.createMany({
            data: lines.map((l) => ({
              organizationId,
              bookingId: existing.id,
              serviceId: l.serviceId,
              name: l.name,
              priceRub: l.priceRub,
              durationMin: l.durationMin,
              quantity: l.quantity,
            })),
          });
        }
      }
    });

    revalidateDesk();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить запись" };
  }
}

/** Отмена записи с обязательной причиной */
export async function cancelDeskBooking(input: {
  id: string;
  reason: string;
}): Promise<DeskActionResult> {
  try {
    const session = await requireManagementSession();
    const organizationId = orgIdOf(session);
    const reason = input.reason.trim();
    if (reason.length < 3) {
      return { ok: false, error: "Укажите причину отмены (минимум 3 символа)" };
    }

    const existing = await prisma.booking.findFirst({
      where: { id: input.id, organizationId },
    });
    if (!existing) return { ok: false, error: "Запись не найдена" };
    if (existing.status === "CANCELLED") {
      return { ok: false, error: "Запись уже отменена" };
    }
    if (existing.workOrderId) {
      return {
        ok: false,
        error: "По записи уже есть заказ-наряд — отменить нельзя",
      };
    }

    await prisma.booking.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    });

    revalidateDesk();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось отменить запись" };
  }
}

/**
 * Клиент приехал: из записи создаём заказ-наряд (IN_PROGRESS) и связываем.
 */
export async function createWorkOrderFromBooking(input: {
  bookingId: string;
  vehicleId?: string;
}): Promise<DeskActionResult & { workOrderId?: string }> {
  try {
    const session = await requireManagementSession();
    const organizationId = orgIdOf(session);

    const booking = await prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId },
      include: { lines: true },
    });
    if (!booking) return { ok: false, error: "Запись не найдена" };
    if (
      !canCreateWorkOrderFromBooking({
        status: booking.status,
        workOrderId: booking.workOrderId,
      })
    ) {
      return {
        ok: false,
        error: booking.workOrderId
          ? "Заказ-наряд по этой записи уже создан"
          : "Нельзя создать ЗН из отменённой записи",
      };
    }

    let customerId = booking.customerId;
    if (!customerId) {
      const byUser = await prisma.customer.findFirst({
        where: { organizationId, userId: booking.clientId },
      });
      customerId = byUser?.id ?? null;
    }
    if (!customerId) {
      return {
        ok: false,
        error: "К записи не привязан клиент справочника — укажите клиента",
      };
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      include: { vehicles: { orderBy: { createdAt: "asc" } } },
    });
    if (!customer) return { ok: false, error: "Клиент не найден" };

    let vehicleId = input.vehicleId || booking.vehicleId || null;
    if (!vehicleId && customer.vehicles.length === 1) {
      vehicleId = customer.vehicles[0].id;
    }
    if (!vehicleId) {
      return {
        ok: false,
        error: "Выберите автомобиль клиента для заказ-наряда",
      };
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId, customerId: customer.id },
      include: { vehicleClass: true },
    });
    if (!vehicle) return { ok: false, error: "Автомобиль не найден" };

    const serviceIds = booking.lines
      .map((l) => l.serviceId)
      .filter((id): id is string => Boolean(id));
    const catalogServices =
      serviceIds.length > 0
        ? await prisma.service.findMany({
            where: { organizationId, id: { in: serviceIds } },
            include: { classPrices: true },
          })
        : [];
    const serviceById = new Map(catalogServices.map((s) => [s.id, s]));

    const lineData =
      booking.lines.length > 0
        ? booking.lines.map((l) => {
            const svc = l.serviceId ? serviceById.get(l.serviceId) : null;
            return {
              serviceId: l.serviceId,
              name: l.name,
              priceRub: svc
                ? resolveServicePriceRub(svc, vehicle.vehicleClassId)
                : l.priceRub,
              durationMin: l.durationMin,
              quantity: l.quantity,
            };
          })
        : [
            {
              serviceId: null,
              name: booking.serviceName || "Услуга",
              priceRub: booking.plannedAmountRub,
              durationMin: booking.durationMin,
              quantity: 1,
            },
          ];

    const workOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: { workOrderSeq: { increment: 1 } },
      });
      const wo = await tx.workOrder.create({
        data: {
          organizationId,
          number: updated.workOrderSeq,
          status: "IN_PROGRESS",
          customerId: customer.id,
          vehicleId: vehicle.id,
          postId: booking.postId,
          scheduledAt: booking.startsAt,
          notes: `Создан из записи · ${booking.serviceName}`,
          lines: { create: lineData },
        },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          workOrderId: wo.id,
          customerId: customer.id,
          vehicleId: vehicle.id,
          status: "CONFIRMED",
          vehicleInfo:
            booking.vehicleInfo ||
            `${vehicle.make} ${vehicle.model} · ${vehicle.plate}`,
        },
      });
      return wo;
    });

    revalidateDesk();
    revalidatePath(`/owner/work-orders/${workOrder.id}`);
    return { ok: true, workOrderId: workOrder.id };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось создать заказ-наряд из записи" };
  }
}

export { selectableBookingStatuses };

export async function updateDeskWorkOrder(input: {
  id: string;
  postId: string;
  startsAtIso: string;
  status: string;
}): Promise<DeskActionResult> {
  try {
    const session = await requireManagementSession();
    const organizationId = orgIdOf(session);
    const startsAt = new Date(input.startsAtIso);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: "Некорректное время" };
    }
    const allowed = ["IN_PROGRESS", "CLOSED"];
    if (!allowed.includes(input.status)) {
      return { ok: false, error: "Некорректный статус" };
    }

    const current = await prisma.workOrder.findFirst({
      where: { id: input.id, organizationId },
      select: { status: true },
    });
    if (!current) {
      return { ok: false, error: "Заказ-наряд не найден" };
    }
    const post = await prisma.servicePost.findFirst({
      where: { id: input.postId, organizationId, isActive: true },
    });
    if (!post) return { ok: false, error: "Пост не найден" };
    const gateErr = await postBookingGateError(
      organizationId,
      post,
      startsAt,
      60,
    );
    if (gateErr) return { ok: false, error: gateErr };
    const nextStatus = input.status as "IN_PROGRESS" | "CLOSED";
    if (!canTransitionWorkOrderStatus(current.status, nextStatus)) {
      return {
        ok: false,
        error:
          "Недопустимый переход статуса. Цепочка заказ-наряда: в работе → закрыт",
      };
    }

    const closing = nextStatus === "CLOSED";
    const now = closing ? new Date() : null;
    const updated = await prisma.workOrder.updateMany({
      where: { id: input.id, organizationId },
      data: {
        postId: input.postId,
        scheduledAt: startsAt,
        status: nextStatus,
        completedAt: now,
        paidAt: now,
        // Закрытие со стола без выбора оплаты — наличные (полный расчёт в карточке ЗН)
        paymentMethod: closing ? "CASH" : null,
      },
    });
    if (updated.count === 0) {
      return { ok: false, error: "Заказ-наряд не найден" };
    }
    if (closing) {
      await applyNormWriteoff({
        organizationId,
        workOrderId: input.id,
        createdById: session.id,
        note: "Списание по нормам при закрытии ЗН со стола",
      });
      revalidatePath("/owner/warehouse");
      revalidatePath("/owner/warehouse/reconcile");
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
  durationMin?: number;
  serviceName?: string;
  plannedAmountRub?: number;
  lines?: PlannedLineInput[];
  customerId?: string;
  newCustomerName?: string;
  newCustomerPhone?: string;
  vehicleInfo?: string;
  vehicleId?: string;
}): Promise<
  DeskActionResult & {
    id?: string;
    plannedAmountRub?: number;
    serviceName?: string;
    durationMin?: number;
    services?: string[];
    customerId?: string;
    vehicleId?: string | null;
  }
> {
  try {
    const session = await requireManagementSession();
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
      const phone = normalizePhone(input.newCustomerPhone || "");
      if (!name) return { ok: false, error: "Укажите клиента" };
      if (!phone) {
        return { ok: false, error: "Укажите телефон — идентификатор клиента" };
      }
      const dup = await prisma.customer.findFirst({
        where: { organizationId, phone },
      });
      if (dup) {
        customer = dup;
      } else {
        customer = await prisma.customer.create({
          data: {
            organizationId,
            name,
            phone,
          },
        });
      }
    }

    const clientId = await ensureBookingUser(organizationId, customer);

    const vehicleId = input.vehicleId?.trim() || null;
    if (vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: {
          id: vehicleId,
          organizationId,
          customerId: customer.id,
        },
      });
      if (!vehicle) return { ok: false, error: "Автомобиль не найден" };
    }

    let lines = normalizePlannedLines(input.lines ?? []);
    if (lines.length === 0 && input.serviceName?.trim()) {
      lines = [
        {
          serviceId: null,
          name: input.serviceName.trim(),
          priceRub: Math.max(0, Math.round(input.plannedAmountRub ?? 0)),
          durationMin: Math.max(15, Math.round(input.durationMin ?? 60)),
          quantity: 1,
        },
      ];
    }
    if (lines.length === 0) {
      return { ok: false, error: "Выберите хотя бы одну услугу" };
    }

    const catalogTotal = bookingLinesTotal(lines);
    const plannedAmountRub =
      typeof input.plannedAmountRub === "number"
        ? Math.max(0, Math.round(input.plannedAmountRub))
        : catalogTotal;
    const durationMin = Math.max(
      15,
      Math.min(
        480,
        Math.round(
          (input.durationMin ?? bookingLinesDuration(lines)) / 15,
        ) * 15,
      ),
    );
    const gateErr = await postBookingGateError(
      organizationId,
      post,
      startsAt,
      durationMin,
    );
    if (gateErr) return { ok: false, error: gateErr };
    const serviceName = summarizeServiceNames(lines);

    const booking = await prisma.booking.create({
      data: {
        organizationId,
        clientId,
        customerId: customer.id,
        postId: input.postId,
        serviceName,
        plannedAmountRub,
        vehicleInfo: input.vehicleInfo?.trim() || null,
        vehicleId,
        startsAt,
        durationMin,
        status: "CONFIRMED",
        lines: {
          create: lines.map((l) => ({
            organizationId,
            serviceId: l.serviceId,
            name: l.name,
            priceRub: l.priceRub,
            durationMin: l.durationMin,
            quantity: l.quantity,
          })),
        },
      },
    });

    revalidateDesk();
    revalidatePath("/owner/clients");
    return {
      ok: true,
      id: booking.id,
      plannedAmountRub,
      serviceName,
      durationMin,
      services: lines.map((l) => l.name),
      customerId: customer.id,
      vehicleId,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось создать запись" };
  }
}

async function ensureBookingUser(
  organizationId: string,
  customer: { id: string; name: string; phone: string; userId: string | null },
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
