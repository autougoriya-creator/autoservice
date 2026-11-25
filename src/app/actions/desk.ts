"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  bookingLinesDuration,
  bookingLinesTotal,
  normalizePlannedLines,
  summarizeServiceNames,
  type PlannedLineInput,
} from "@/lib/booking-plan";
import { normalizePhone } from "@/lib/phone";
import { isWithinPostHours } from "@/lib/payroll";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
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
  return `Время вне графика «${post.name}» (${pad(post.workStartHour)}:00–${pad(post.workEndHour)}:00)`;
}

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
      const hoursErr = postHoursError(startsAt, durationMin, post);
      if (hoursErr) return { ok: false, error: hoursErr };
      const updated = await prisma.booking.updateMany({
        where: { id: input.id, organizationId },
        data,
      });
      if (updated.count === 0) return { ok: false, error: "Запись не найдена" };
    } else {
      const hoursErr = postHoursError(startsAt, 60, post);
      if (hoursErr) return { ok: false, error: hoursErr };
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
    const allowed = ["PENDING", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED"];
    if (!allowed.includes(input.status)) {
      return { ok: false, error: "Некорректный статус" };
    }

    const existing = await prisma.booking.findFirst({
      where: { id: input.id, organizationId },
    });
    if (!existing) return { ok: false, error: "Запись не найдена" };

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
    const hoursErr = postHoursError(startsAt, durationMin, post);
    if (hoursErr) return { ok: false, error: hoursErr };
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
          status: input.status as
            | "PENDING"
            | "CONFIRMED"
            | "IN_PROGRESS"
            | "DONE"
            | "CANCELLED",
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
    revalidatePath("/owner/planned");
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
    const session = await requireManagementSession();
    const organizationId = orgIdOf(session);
    const startsAt = new Date(input.startsAtIso);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: "Некорректное время" };
    }
    const allowed = [
      "NEW",
      "NEW_FROM_CLIENT",
      "CONFIRMED",
      "IN_PROGRESS",
      "CLOSED",
    ];
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
    const hoursErr = postHoursError(startsAt, 60, post);
    if (hoursErr) return { ok: false, error: hoursErr };
    const nextStatus = input.status as
      | "NEW"
      | "NEW_FROM_CLIENT"
      | "CONFIRMED"
      | "IN_PROGRESS"
      | "CLOSED";
    if (!canTransitionWorkOrderStatus(current.status, nextStatus)) {
      return {
        ok: false,
        error:
          "Недопустимый переход статуса. Цепочка: новый / новый от клиента → подтверждён → в работе → закрыт",
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
}): Promise<
  DeskActionResult & {
    id?: string;
    plannedAmountRub?: number;
    serviceName?: string;
    durationMin?: number;
    services?: string[];
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
    const hoursErr = postHoursError(startsAt, durationMin, post);
    if (hoursErr) return { ok: false, error: hoursErr };
    const serviceName = summarizeServiceNames(lines);

    const booking = await prisma.booking.create({
      data: {
        organizationId,
        clientId,
        postId: input.postId,
        serviceName,
        plannedAmountRub,
        vehicleInfo: input.vehicleInfo?.trim() || null,
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
    revalidatePath("/owner/planned");
    return {
      ok: true,
      id: booking.id,
      plannedAmountRub,
      serviceName,
      durationMin,
      services: lines.map((l) => l.name),
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
