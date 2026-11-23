import {
  PrismaClient,
  Role,
  BookingStatus,
  WorkOrderStatus,
  PayMode,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.staffShift.deleteMany();
  await prisma.postAssignment.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.workOrderLine.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.bookingLine.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.order.deleteMany();
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

  const admin = await prisma.user.create({
    data: {
      email: "admin@demo.local",
      name: "Ольга Админова",
      phone: "+7 (900) 101-20-30",
    },
  });

  const staff = await prisma.user.create({
    data: {
      email: "staff@demo.local",
      name: "Сергей Мастеров",
      phone: "+7 (900) 222-33-44",
    },
  });

  const washer = await prisma.user.create({
    data: {
      email: "washer@demo.local",
      name: "Павел Мойщиков",
      phone: "+7 (900) 444-55-66",
    },
  });

  const mechanic = await prisma.user.create({
    data: {
      email: "mechanic@demo.local",
      name: "Дмитрий Слесарев",
      phone: "+7 (900) 777-88-99",
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
      { organizationId: org.id, userId: admin.id, role: Role.ADMIN },
      { organizationId: org.id, userId: staff.id, role: Role.STAFF },
      { organizationId: org.id, userId: washer.id, role: Role.STAFF },
      { organizationId: org.id, userId: mechanic.id, role: Role.STAFF },
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

  const sportage = await prisma.vehicle.create({
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

  const vesta = await prisma.vehicle.create({
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
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const at = (hour: number, minute = 0) => {
    const d = new Date(today);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(10, 0, 0, 0);

  const svc = Object.fromEntries(services.map((s) => [s.name, s]));

  async function seedBooking(opts: {
    postId: string;
    startsAt: Date;
    status: BookingStatus;
    vehicleInfo: string;
    serviceNames: string[];
    /** optional override of catalog sum */
    plannedAmountRub?: number;
    durationMin?: number;
  }) {
    const lines = opts.serviceNames.map((name) => {
      const s = svc[name];
      return {
        organizationId: org.id,
        serviceId: s?.id ?? null,
        name,
        priceRub: s?.priceRub ?? 0,
        durationMin: s?.durationMin ?? 30,
        quantity: 1,
      };
    });
    const plannedAmountRub =
      opts.plannedAmountRub ??
      lines.reduce((sum, l) => sum + l.priceRub * l.quantity, 0);
    const durationMin =
      opts.durationMin ??
      Math.max(
        15,
        lines.reduce((sum, l) => sum + l.durationMin * l.quantity, 0),
      );
    const serviceName = opts.serviceNames.join(", ");
    await prisma.booking.create({
      data: {
        organizationId: org.id,
        clientId: clientUser.id,
        postId: opts.postId,
        serviceName,
        plannedAmountRub,
        vehicleInfo: opts.vehicleInfo,
        startsAt: opts.startsAt,
        durationMin,
        status: opts.status,
        lines: { create: lines },
      },
    });
  }

  // Dense day occupancy with catalog prices for план выручки
  await seedBooking({
    postId: posts[0].id,
    startsAt: at(8, 0),
    status: BookingStatus.DONE,
    vehicleInfo: "Toyota Camry · А123ВС777",
    serviceNames: ["Экспресс-мойка"],
  });
  await seedBooking({
    postId: posts[0].id,
    startsAt: at(9, 0),
    status: BookingStatus.IN_PROGRESS,
    vehicleInfo: "Kia Sportage · К456ОР777",
    serviceNames: ["Комплексная мойка", "Пылесос салона"],
  });
  await seedBooking({
    postId: posts[0].id,
    startsAt: at(11, 0),
    status: BookingStatus.CONFIRMED,
    vehicleInfo: "Toyota Camry · А123ВС777",
    serviceNames: ["Комплексная мойка"],
  });
  await seedBooking({
    postId: posts[0].id,
    startsAt: at(14, 0),
    status: BookingStatus.CONFIRMED,
    vehicleInfo: "Lada Vesta · В321АА50",
    serviceNames: ["Пылесос салона"],
  });
  await seedBooking({
    postId: posts[0].id,
    startsAt: at(16, 30),
    status: BookingStatus.PENDING,
    vehicleInfo: "Toyota Camry · А123ВС777",
    serviceNames: ["Экспресс-мойка"],
  });
  await seedBooking({
    postId: posts[1].id,
    startsAt: at(8, 30),
    status: BookingStatus.DONE,
    vehicleInfo: "Volkswagen Polo · М789ТУ199",
    serviceNames: ["Комплексная мойка"],
  });
  await seedBooking({
    postId: posts[1].id,
    startsAt: at(10, 30),
    status: BookingStatus.CONFIRMED,
    vehicleInfo: "Kia Sportage · К456ОР777",
    serviceNames: ["Мойка двигателя"],
  });
  await seedBooking({
    postId: posts[1].id,
    startsAt: at(13, 0),
    status: BookingStatus.CONFIRMED,
    vehicleInfo: "Lada Vesta · В321АА50",
    serviceNames: ["Экспресс-мойка"],
  });
  await seedBooking({
    postId: posts[1].id,
    startsAt: at(15, 0),
    status: BookingStatus.PENDING,
    vehicleInfo: "Volkswagen Polo · М789ТУ199",
    serviceNames: ["Комплексная мойка", "Экспресс-мойка"],
    plannedAmountRub: 1700,
  });
  await seedBooking({
    postId: posts[1].id,
    startsAt: at(18, 0),
    status: BookingStatus.PENDING,
    vehicleInfo: "Toyota Camry · А123ВС777",
    serviceNames: ["Экспресс-мойка"],
  });
  await seedBooking({
    postId: posts[2].id,
    startsAt: at(9, 0),
    status: BookingStatus.IN_PROGRESS,
    vehicleInfo: "Toyota Camry · А123ВС777",
    serviceNames: ["Химчистка салона"],
  });
  await seedBooking({
    postId: posts[2].id,
    startsAt: at(15, 0),
    status: BookingStatus.CONFIRMED,
    vehicleInfo: "Volkswagen Polo · М789ТУ199",
    serviceNames: ["Полировка кузова"],
  });
  await seedBooking({
    postId: posts[2].id,
    startsAt: tomorrow,
    status: BookingStatus.PENDING,
    vehicleInfo: "Toyota Camry · А123ВС777",
    serviceNames: ["Полировка кузова", "Мойка двигателя"],
  });

  async function createWorkOrder(opts: {
    customerId: string;
    vehicleId: string;
    status: WorkOrderStatus;
    notes?: string;
    completedAt?: Date;
    postId?: string;
    scheduledAt?: Date;
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
        postId: opts.postId,
        scheduledAt: opts.scheduledAt,
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
    postId: posts[0].id,
    scheduledAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
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
    postId: posts[0].id,
    scheduledAt: at(12, 0),
    notes: "В работе — комплекс + двигатель",
    lines: [
      { serviceId: services[1].id },
      { serviceId: services[4].id },
    ],
  });

  await createWorkOrder({
    customerId: customerMaria.id,
    vehicleId: polo.id,
    status: WorkOrderStatus.OPEN,
    postId: posts[1].id,
    scheduledAt: at(17, 0),
    notes: "Вечерний экспресс",
    lines: [{ serviceId: services[0].id }],
  });

  await createWorkOrder({
    customerId: customerIvan.id,
    vehicleId: vesta.id,
    status: WorkOrderStatus.OPEN,
    postId: posts[0].id,
    scheduledAt: at(18, 30),
    lines: [{ serviceId: services[1].id }],
  });

  await createWorkOrder({
    customerId: customerAlex.id,
    vehicleId: sportage.id,
    status: WorkOrderStatus.OPEN,
    postId: posts[2].id,
    scheduledAt: at(13, 0),
    notes: "Детейлинг — слот после химчистки",
    lines: [{ serviceId: services[5].id }],
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

  const profileSergey = await prisma.staffProfile.create({
    data: {
      organizationId: org.id,
      userId: staff.id,
      title: "Старший мойщик",
      payMode: PayMode.DEAL,
      dealPercent: 35,
      salaryRub: 0,
    },
  });

  const profilePavel = await prisma.staffProfile.create({
    data: {
      organizationId: org.id,
      userId: washer.id,
      title: "Мойщик",
      payMode: PayMode.DEAL,
      dealPercent: 30,
      salaryRub: 0,
    },
  });

  const profileDmitry = await prisma.staffProfile.create({
    data: {
      organizationId: org.id,
      userId: mechanic.id,
      title: "Слесарь / детейлер",
      payMode: PayMode.SALARY,
      dealPercent: 0,
      salaryRub: 90000,
    },
  });

  await prisma.postAssignment.createMany({
    data: [
      {
        organizationId: org.id,
        postId: posts[0].id,
        staffProfileId: profileSergey.id,
      },
      {
        organizationId: org.id,
        postId: posts[1].id,
        staffProfileId: profilePavel.id,
      },
      {
        organizationId: org.id,
        postId: posts[2].id,
        staffProfileId: profileDmitry.id,
      },
    ],
  });

  const shift = (profileId: string, postId: string, hourStart: number, hourEnd: number, dayOffset = 0) => {
    const startsAt = new Date(today);
    startsAt.setDate(startsAt.getDate() + dayOffset);
    startsAt.setHours(hourStart, 0, 0, 0);
    const endsAt = new Date(today);
    endsAt.setDate(endsAt.getDate() + dayOffset);
    endsAt.setHours(hourEnd, 0, 0, 0);
    return {
      organizationId: org.id,
      staffProfileId: profileId,
      postId,
      startsAt,
      endsAt,
    };
  };

  await prisma.staffShift.createMany({
    data: [
      shift(profileSergey.id, posts[0].id, 8, 16, 0),
      shift(profileSergey.id, posts[0].id, 8, 16, 1),
      shift(profilePavel.id, posts[1].id, 10, 18, 0),
      shift(profilePavel.id, posts[1].id, 10, 18, -1),
      shift(profileDmitry.id, posts[2].id, 9, 18, 0),
      shift(profileDmitry.id, posts[2].id, 9, 18, 2),
      shift(profileDmitry.id, posts[2].id, 9, 15, -2),
    ],
  });

  console.log("Seed OK");
  console.log("Demo tenant:", org.name, `(${org.slug})`);
  console.log("Logins (mock auth, no password):");
  console.log("  owner@demo.local     → владелец (ЗП, экономика)");
  console.log("  admin@demo.local      → администратор (стол, клиенты, график)");
  console.log("  staff@demo.local      → сотрудник / мойщик (сделка 35%)");
  console.log("  washer@demo.local     → сотрудник / мойщик (сделка 30%)");
  console.log("  mechanic@demo.local   → сотрудник / слесарь (оклад)");
  console.log("  client@demo.local     → клиент (ЛК)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
