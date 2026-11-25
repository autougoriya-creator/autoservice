"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentMethod, WorkOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveServicePriceRub } from "@/lib/pricing";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { applyNormWriteoff } from "@/lib/warehouse";
import {
  WORK_ORDER_STATUSES,
  canMarkWorkOrderInProgress,
  canTransitionWorkOrderStatus,
} from "@/lib/work-order";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function intOr(formData: FormData, key: string, fallback: number) {
  const raw = str(formData, key);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const allowedStatuses: WorkOrderStatus[] = [...WORK_ORDER_STATUSES];

const allowedPayments: PaymentMethod[] = [
  "CASH",
  "TERMINAL",
  "INVOICE",
  "CASH_AND_TERMINAL",
];

function revalidateWorkOrder(id: string) {
  revalidatePath("/owner/work-orders");
  revalidatePath(`/owner/work-orders/${id}`);
  revalidatePath("/owner/desk");
  revalidatePath("/owner/my-work");
  revalidatePath("/owner/cash");
  revalidatePath("/client");
  revalidatePath("/client/orders");
}

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
      include: { classPrices: true },
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
        create: services.map((service) => {
          const requested = intOr(
            formData,
            `durationMin_${service.id}`,
            service.durationMin,
          );
          // Админ может увеличить норму, но не уменьшить
          const durationMin = Math.max(service.durationMin, requested);
          return {
            serviceId: service.id,
            name: service.name,
            priceRub: resolveServicePriceRub(
              service,
              vehicle.vehicleClassId,
            ),
            durationMin,
            quantity: 1,
          };
        }),
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

  const current = await prisma.workOrder.findFirst({
    where: { id, organizationId },
    select: { status: true },
  });
  if (!current) throw new Error("Заказ-наряд не найден");
  if (!canTransitionWorkOrderStatus(current.status, status)) {
    throw new Error(
      "Недопустимый переход статуса. Цепочка: новый / новый от клиента → подтверждён → в работе → закрыт",
    );
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

  revalidateWorkOrder(id);
  redirect(`/owner/work-orders/${id}`);
}

/** Админ / мойщик: ТС заехало → в работе */
export async function markWorkOrderInProgress(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  if (!id) throw new Error("Некорректный заказ-наряд");

  const current = await prisma.workOrder.findFirst({
    where: { id, organizationId },
    select: { status: true },
  });
  if (!current) throw new Error("Заказ-наряд не найден");
  if (!canMarkWorkOrderInProgress(current.status)) {
    throw new Error(
      "Статус «В работе» можно поставить только для нового, нового от клиента или подтверждённого заказа",
    );
  }

  await prisma.workOrder.updateMany({
    where: { id, organizationId },
    data: {
      status: "IN_PROGRESS",
      completedAt: null,
      paidAt: null,
      paymentMethod: null,
    },
  });

  revalidateWorkOrder(id);
  redirect(`/owner/work-orders/${id}`);
}

/**
 * Админ или мойщик добавляет услугу в заказ-наряд
 * (мойщик — по просьбе клиента; админ — при проверке/проведении).
 */
export async function addWorkOrderLine(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const workOrderId = str(formData, "workOrderId");
  const serviceId = str(formData, "serviceId");
  const quantity = Math.max(1, intOr(formData, "quantity", 1));

  if (!workOrderId || !serviceId) {
    throw new Error("Выберите услугу");
  }

  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, organizationId },
    include: { vehicle: true },
  });
  if (!workOrder) throw new Error("Заказ-наряд не найден");
  if (workOrder.status === "CLOSED") {
    throw new Error("Нельзя добавить услугу в закрытый заказ-наряд");
  }

  const service = await prisma.service.findFirst({
    where: { id: serviceId, organizationId, isActive: true },
    include: { classPrices: true },
  });
  if (!service) throw new Error("Услуга не найдена");

  const requested = intOr(formData, "durationMin", service.durationMin);
  const durationMin = Math.max(service.durationMin, requested);

  await prisma.workOrderLine.create({
    data: {
      workOrderId,
      serviceId: service.id,
      name: service.name,
      priceRub: resolveServicePriceRub(
        service,
        workOrder.vehicle.vehicleClassId,
      ),
      durationMin,
      quantity,
    },
  });

  revalidateWorkOrder(workOrderId);
  redirect(`/owner/work-orders/${workOrderId}`);
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
