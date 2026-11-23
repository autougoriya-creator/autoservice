import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

export const AUTH_COOKIE = "autoservice_demo_user";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  membership: {
    id: string;
    role: Role;
    organization: {
      id: string;
      name: string;
      slug: string;
    };
  };
};

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const userId = jar.get(AUTH_COOKIE)?.value;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { organization: true },
        take: 1,
      },
    },
  });

  if (!user || user.memberships.length === 0) return null;

  const membership = user.memberships[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    membership: {
      id: membership.id,
      role: membership.role,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
    },
  };
}

export async function requireSession(
  allowedRoles?: Role[],
): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (allowedRoles && !allowedRoles.includes(session.membership.role)) {
    redirect(homeForRole(session.membership.role));
  }
  return session;
}

export function homeForRole(role: Role): string {
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return "/owner";
    case "STAFF":
      return "/owner/my-work";
    case "CLIENT":
      return "/client";
    default:
      return "/login";
  }
}

export const DEMO_ACCOUNTS = [
  {
    email: "owner@demo.local",
    label: "Владелец",
    description: "Полный доступ, ЗП и экономика",
  },
  {
    email: "admin@demo.local",
    label: "Администратор",
    description: "Клиенты, стол, график, посты",
  },
  {
    email: "staff@demo.local",
    label: "Сотрудник",
    description: "Мойщик · сделка 35%",
  },
  {
    email: "washer@demo.local",
    label: "Сотрудник",
    description: "Мойщик · сделка 30%",
  },
  {
    email: "mechanic@demo.local",
    label: "Сотрудник",
    description: "Слесарь · оклад",
  },
  {
    email: "client@demo.local",
    label: "Клиент",
    description: "Личный кабинет",
  },
] as const;
