import { PrismaClient, Role, BookingStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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

  const client = await prisma.user.create({
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
      { organizationId: org.id, userId: client.id, role: Role.CLIENT },
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

  const now = new Date();
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await prisma.booking.createMany({
    data: [
      {
        organizationId: org.id,
        clientId: client.id,
        postId: posts[0].id,
        serviceName: "Комплексная мойка",
        vehicleInfo: "Toyota Camry · А123ВС777",
        startsAt: inTwoHours,
        status: BookingStatus.CONFIRMED,
      },
      {
        organizationId: org.id,
        clientId: client.id,
        postId: posts[2].id,
        serviceName: "Полировка кузова",
        vehicleInfo: "Toyota Camry · А123ВС777",
        startsAt: tomorrow,
        status: BookingStatus.PENDING,
      },
    ],
  });

  await prisma.order.createMany({
    data: [
      {
        organizationId: org.id,
        clientId: client.id,
        title: "Экспресс-мойка + пылесос",
        amountRub: 1200,
        completedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        organizationId: org.id,
        clientId: client.id,
        title: "Химчистка салона",
        amountRub: 4500,
        completedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      },
      {
        organizationId: org.id,
        clientId: client.id,
        title: "Мойка двигателя",
        amountRub: 1800,
        completedAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
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
