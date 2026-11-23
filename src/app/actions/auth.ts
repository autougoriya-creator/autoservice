"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, homeForRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function loginAs(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: { take: 1 },
    },
  });

  if (!user || user.memberships.length === 0) {
    throw new Error("Пользователь не найден. Запустите npm run db:seed");
  }

  const jar = await cookies();
  jar.set(AUTH_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  redirect(homeForRole(user.memberships[0].role));
}

export async function logout() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  redirect("/");
}
