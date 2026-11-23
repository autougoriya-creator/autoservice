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
import { orgIdOf, requireManagementSession } from "@/lib/tenant";

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
