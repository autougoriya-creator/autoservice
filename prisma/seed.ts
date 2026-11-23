import {
  PrismaClient,
  Role,
  BookingStatus,
  WorkOrderStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.workOrderLine.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.service.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.order.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.servicePost.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: {
      name: "Автомойка Север",
      slug: "sever",
      workOrderSeq: 0,
    },
  });

  const owner = await prisma.user.create({
    data: {
      email: "owner@demo.local",
      name: "Ирина Владельцева",
      phone: "+7 (900) 111-22-33",
    },
  });

  const staff = await prisma.user.create({
    data: {
      email: "staff@demo.local",
      name: "Сергей Мастеров",
      phone: "+7 (900) 222-33-44",
    },
  });

  const clientUser = await prisma.user.create({
    data: {
      email: "client@demo.local",
      name: "Алексей Клиентов",
      phone: "+7 (900) 333-44-55",
    },
  });

  await prisma.membership.createMany({
    data: [
      { organizationId: org.id, userId: owner.id, role: Role.OWNER },
      { organizationId: org.id, userId: staff.id, role: Role.STAFF },
      { organizationId: org.id, userId: clientUser.id, role: Role.CLIENT },
    ],
  });

  const posts = await Promise.all(
    ["Пост 1 — мойка", "Пост 2 — мойка", "Пост 3 — детейлинг"].map(
      (name, index) =>
        prisma.servicePost.create({
          data: {
            name,
            sortOrder: index + 1,
            organizationId: org.id,
          },
        }),
    ),
  );

  const customerAlex = await prisma.customer.create({
    data: {
      organizationId: org.id,
      userId: clientUser.id,
      name: "Алексей Клиентов",
      phone: "+7 (900) 333-44-55",
      email: "client@demo.local",
      notes: "Постоянный клиент, предпочитает пост 1",
    },
  });

  const customerMaria = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Мария Орлова",
      phone: "+7 (900) 555-66-77",
      email: "maria@example.com",
    },
  });

  const customerIvan = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Иван Петров",
      phone: "+7 (900) 888-99-00",
    },
  });

  const camry = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customerAlex.id,
      make: "Toyota",
      model: "Camry",
      plate: "А123ВС777",
      year: 2021,
      color: "Чёрный",
    },
  });

  await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customerAlex.id,
      make: "Kia",
      model: "Sportage",
      plate: "К456ОР777",
      year: 2019,
      color: "Серый",
    },
  });

  const polo = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customerMaria.id,
      make: "Volkswagen",
      model: "Polo",
      plate: "М789ТУ199",
      year: 2018,
      color: "Белый",
    },
  });

  await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customerIvan.id,
      make: "Lada",
      model: "Vesta",
      plate: "В321АА50",
      year: 2022,
    },
  });

  const services = await Promise.all(
    [
      { name: "Экспресс-мойка", priceRub: 600, durationMin: 20 },
      { name: "Комплексная мойка", priceRub: 1200, durationMin: 45 },
      { name: "Химчистка салона", priceRub: 4500, durationMin: 180 },
      { name: "Полировка кузова", priceRub: 8000, durationMin: 240 },
      { name: "Мойка двигателя", priceRub: 1800, durationMin: 40 },
      { name: "Пылесос салона", priceRub: 400, durationMin: 15 },
    ].map((s) =>
      prisma.service.create({
        data: { organizationId: org.id, ...s },
      }),
    ),
  );

  const now = new Date();
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await prisma.booking.createMany({
    data: [
      {
        organizationId: org.id,
        clientId: clientUser.id,
        postId: posts[0].id,
        serviceName: "Комплексная мойка",
        vehicleInfo: "Toyota Camry · А123ВС777",
        startsAt: inTwoHours,
        status: BookingStatus.CONFIRMED,
      },
      {
        organizationId: org.id,
        clientId: clientUser.id,
        postId: posts[2].id,
        serviceName: "Полировка кузова",
        vehicleInfo: "Toyota Camry · А123ВС777",
        startsAt: tomorrow,
        status: BookingStatus.PENDING,
      },
    ],
  });

  // Work orders
  async function createWorkOrder(opts: {
    customerId: string;
    vehicleId: string;
    status: WorkOrderStatus;
    notes?: string;
    completedAt?: Date;
    lines: { serviceId: string; quantity?: number }[];
  }) {
    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: { workOrderSeq: { increment: 1 } },
    });

    const lineData = opts.lines.map((line) => {
      const service = services.find((s) => s.id === line.serviceId)!;
      return {
        serviceId: service.id,
        name: service.name,
        priceRub: service.priceRub,
        durationMin: service.durationMin,
        quantity: line.quantity ?? 1,
      };
    });

    return prisma.workOrder.create({
      data: {
        organizationId: org.id,
        number: updated.workOrderSeq,
        status: opts.status,
        customerId: opts.customerId,
        vehicleId: opts.vehicleId,
        notes: opts.notes,
        completedAt: opts.completedAt,
        lines: { create: lineData },
      },
    });
  }

  await createWorkOrder({
    customerId: customerAlex.id,
    vehicleId: camry.id,
    status: WorkOrderStatus.DONE,
    completedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    notes: "Выполнено на посту 1",
    lines: [
      { serviceId: services[1].id },
      { serviceId: services[5].id },
    ],
  });

  await createWorkOrder({
    customerId: customerAlex.id,
    vehicleId: camry.id,
    status: WorkOrderStatus.DONE,
    completedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
    lines: [{ serviceId: services[2].id }],
  });

  await createWorkOrder({
    customerId: customerAlex.id,
    vehicleId: camry.id,
    status: WorkOrderStatus.IN_PROGRESS,
    notes: "В работе — комплекс",
    lines: [
      { serviceId: services[1].id },
      { serviceId: services[4].id },
    ],
  });

  await createWorkOrder({
    customerId: customerMaria.id,
    vehicleId: polo.id,
    status: WorkOrderStatus.OPEN,
    lines: [{ serviceId: services[0].id }],
  });

  // Keep legacy Order rows for older stub screens if any remain
  await prisma.order.createMany({
    data: [
      {
        organizationId: org.id,
        clientId: clientUser.id,
        title: "Экспресс-мойка + пылесос",
        amountRub: 1200,
        completedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        organizationId: org.id,
        clientId: clientUser.id,
        title: "Химчистка салона",
        amountRub: 4500,
        completedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  console.log("Seed OK");
  console.log("Demo tenant:", org.name, `(${org.slug})`);
  console.log("Logins (mock auth, no password):");
  console.log("  owner@demo.local  → кабинет владельца");
  console.log("  staff@demo.local  → кабинет персонала");
  console.log("  client@demo.local → личный кабинет клиента");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
