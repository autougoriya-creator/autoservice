"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentMethod, WorkOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { applyNormWriteoff } from "@/lib/warehouse";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const allowedStatuses: WorkOrderStatus[] = [
  "NEW",
  "NEW_FROM_CLIENT",
  "CONFIRMED",
  "IN_PROGRESS",
  "CLOSED",
];

const allowedPayments: PaymentMethod[] = [
  "CASH",
  "TERMINAL",
  "INVOICE",
  "CASH_AND_TERMINAL",
];

export async function createWorkOrder(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const customerId = str(formData, "customerId");
  const vehicleId = str(formData, "vehicleId");
  const notes = str(formData, "notes") || null;
  const serviceIds = formData.getAll("serviceIds").filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  if (!customerId || !vehicleId) {
    throw new Error("Выберите клиента и автомобиль");
  }
  if (serviceIds.length === 0) {
    throw new Error("Добавьте хотя бы одну услугу");
  }

  const [customer, vehicle, services] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, organizationId } }),
    prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId, customerId },
    }),
    prisma.service.findMany({
      where: { organizationId, id: { in: serviceIds }, isActive: true },
    }),
  ]);

  if (!customer || !vehicle) throw new Error("Клиент или авто не найдены");
  if (services.length === 0) throw new Error("Услуги не найдены");

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { workOrderSeq: { increment: 1 } },
  });

  const workOrder = await prisma.workOrder.create({
    data: {
      organizationId,
      number: updated.workOrderSeq,
      status: "NEW",
      customerId,
      vehicleId,
      notes,
      lines: {
        create: services.map((service) => ({
          serviceId: service.id,
          name: service.name,
          priceRub: service.priceRub,
          durationMin: service.durationMin,
          quantity: 1,
        })),
      },
    },
  });

  revalidatePath("/owner/work-orders");
  redirect(`/owner/work-orders/${workOrder.id}`);
}

export async function updateWorkOrderStatus(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const status = str(formData, "status") as WorkOrderStatus;
  const paymentMethodRaw = str(formData, "paymentMethod");

  if (!id || !allowedStatuses.includes(status)) {
    throw new Error("Некорректный статус");
  }

  if (status === "CLOSED") {
    if (!allowedPayments.includes(paymentMethodRaw as PaymentMethod)) {
      throw new Error("Укажите вид оплаты для закрытия заказ-наряда");
    }
    const writeOffByNorms = str(formData, "writeOffByNorms") === "1";
    const now = new Date();
    await prisma.workOrder.updateMany({
      where: { id, organizationId },
      data: {
        status,
        paymentMethod: paymentMethodRaw as PaymentMethod,
        paidAt: now,
        completedAt: now,
      },
    });
    if (writeOffByNorms) {
      await applyNormWriteoff({
        organizationId,
        workOrderId: id,
        createdById: session.id,
        note: "Автосписание по нормам при закрытии ЗН",
      });
      revalidatePath("/owner/warehouse");
    }
  } else {
    await prisma.workOrder.updateMany({
      where: { id, organizationId },
      data: {
        status,
        completedAt: null,
        paidAt: null,
        paymentMethod: null,
      },
    });
  }

  revalidatePath("/owner/work-orders");
  revalidatePath(`/owner/work-orders/${id}`);
  revalidatePath("/owner/cash");
  revalidatePath("/client");
  revalidatePath("/client/orders");
  redirect(`/owner/work-orders/${id}`);
}

/** Админ / мойщик: ТС заехало → в работе */
export async function markWorkOrderInProgress(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  if (!id) throw new Error("Некорректный заказ-наряд");

  await prisma.workOrder.updateMany({
    where: { id, organizationId },
    data: {
      status: "IN_PROGRESS",
      completedAt: null,
      paidAt: null,
      paymentMethod: null,
    },
  });

  revalidatePath("/owner/work-orders");
  revalidatePath(`/owner/work-orders/${id}`);
  revalidatePath("/owner/desk");
  redirect(`/owner/work-orders/${id}`);
}

export async function updateWorkOrderNotes(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const notes = str(formData, "notes") || null;

  await prisma.workOrder.updateMany({
    where: { id, organizationId },
    data: { notes },
  });

  revalidatePath(`/owner/work-orders/${id}`);
  redirect(`/owner/work-orders/${id}`);
}
