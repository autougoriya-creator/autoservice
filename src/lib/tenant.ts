import type { SessionUser } from "@/lib/auth";
import { requireSession } from "@/lib/auth";
import type { Role } from "@prisma/client";

export async function requireStaffSession(roles: Role[] = ["OWNER", "STAFF"]) {
  return requireSession(roles);
}

export function orgIdOf(session: SessionUser) {
  return session.membership.organization.id;
}
