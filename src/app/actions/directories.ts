"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optStr(formData: FormData, key: string) {
  const value = str(formData, key);
  return value || null;
}

function intOr(formData: FormData, key: string, fallback = 0) {
  const raw = str(formData, key);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function createCustomer(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const name = str(formData, "name");
  if (!name) throw new Error("Укажите имя клиента");

  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name,
      phone: optStr(formData, "phone"),
      email: optStr(formData, "email"),
      notes: optStr(formData, "notes"),
    },
  });

  revalidatePath("/owner/clients");
  redirect(`/owner/clients/${customer.id}`);
}

export async function updateCustomer(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!id || !name) throw new Error("Некорректные данные");

  await prisma.customer.updateMany({
    where: { id, organizationId },
    data: {
      name,
      phone: optStr(formData, "phone"),
      email: optStr(formData, "email"),
      notes: optStr(formData, "notes"),
    },
  });

  revalidatePath("/owner/clients");
  revalidatePath(`/owner/clients/${id}`);
  redirect(`/owner/clients/${id}`);
}

export async function deleteCustomer(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");

  await prisma.customer.deleteMany({ where: { id, organizationId } });
  revalidatePath("/owner/clients");
  redirect("/owner/clients");
}

export async function createVehicle(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const customerId = str(formData, "customerId");
  const make = str(formData, "make");
  const model = str(formData, "model");
  const plate = str(formData, "plate").toUpperCase();

  if (!customerId || !make || !model || !plate) {
    throw new Error("Заполните клиента, марку, модель и госномер");
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
  });
  if (!customer) throw new Error("Клиент не найден");

  const yearRaw = str(formData, "year");
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : null;

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId,
      customerId,
      make,
      model,
      plate,
      year: year && Number.isFinite(year) ? year : null,
      color: optStr(formData, "color"),
      vin: optStr(formData, "vin"),
    },
  });

  revalidatePath("/owner/vehicles");
  revalidatePath(`/owner/clients/${customerId}`);
  redirect(`/owner/vehicles/${vehicle.id}`);
}

export async function updateVehicle(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const customerId = str(formData, "customerId");
  const make = str(formData, "make");
  const model = str(formData, "model");
  const plate = str(formData, "plate").toUpperCase();

  if (!id || !customerId || !make || !model || !plate) {
    throw new Error("Некорректные данные");
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
  });
  if (!customer) throw new Error("Клиент не найден");

  const yearRaw = str(formData, "year");
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : null;

  await prisma.vehicle.updateMany({
    where: { id, organizationId },
    data: {
      customerId,
      make,
      model,
      plate,
      year: year && Number.isFinite(year) ? year : null,
      color: optStr(formData, "color"),
      vin: optStr(formData, "vin"),
    },
  });

  revalidatePath("/owner/vehicles");
  revalidatePath(`/owner/vehicles/${id}`);
  redirect(`/owner/vehicles/${id}`);
}

export async function deleteVehicle(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");

  await prisma.vehicle.deleteMany({ where: { id, organizationId } });
  revalidatePath("/owner/vehicles");
  redirect("/owner/vehicles");
}

export async function createService(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const name = str(formData, "name");
  const priceRub = intOr(formData, "priceRub");
  const durationMin = intOr(formData, "durationMin");

  if (!name || priceRub < 0 || durationMin <= 0) {
    throw new Error("Укажите название, цену и длительность");
  }

  const service = await prisma.service.create({
    data: {
      organizationId,
      name,
      priceRub,
      durationMin,
      isActive: str(formData, "isActive") !== "0",
    },
  });

  revalidatePath("/owner/services");
  redirect(`/owner/services/${service.id}`);
}

export async function updateService(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");
  const name = str(formData, "name");
  const priceRub = intOr(formData, "priceRub");
  const durationMin = intOr(formData, "durationMin");

  if (!id || !name || priceRub < 0 || durationMin <= 0) {
    throw new Error("Некорректные данные");
  }

  await prisma.service.updateMany({
    where: { id, organizationId },
    data: {
      name,
      priceRub,
      durationMin,
      isActive: str(formData, "isActive") !== "0",
    },
  });

  revalidatePath("/owner/services");
  revalidatePath(`/owner/services/${id}`);
  redirect(`/owner/services/${id}`);
}

export async function deleteService(formData: FormData) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const id = str(formData, "id");

  await prisma.service.deleteMany({ where: { id, organizationId } });
  revalidatePath("/owner/services");
  redirect("/owner/services");
}
