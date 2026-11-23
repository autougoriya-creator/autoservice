"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { WorkOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const allowedStatuses: WorkOrderStatus[] = [
  "DRAFT",
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
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
      status: "OPEN",
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

  if (!id || !allowedStatuses.includes(status)) {
    throw new Error("Некорректный статус");
  }

  await prisma.workOrder.updateMany({
    where: { id, organizationId },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });

  revalidatePath("/owner/work-orders");
  revalidatePath(`/owner/work-orders/${id}`);
  revalidatePath("/client");
  revalidatePath("/client/orders");
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
