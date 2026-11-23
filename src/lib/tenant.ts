import type { SessionUser } from "@/lib/auth";
import { requireSession } from "@/lib/auth";
import type { Role } from "@prisma/client";

/** Ops cabinet: owner, admin, and floor staff */
export const OPS_ROLES: Role[] = ["OWNER", "ADMIN", "STAFF"];

/** Day-to-day management without payroll/finance */
export const MANAGEMENT_ROLES: Role[] = ["OWNER", "ADMIN"];

/** Full access including payroll, pay settings, P&L */
export const OWNER_ONLY: Role[] = ["OWNER"];

export async function requireStaffSession(roles: Role[] = OPS_ROLES) {
  return requireSession(roles);
}

export async function requireManagementSession() {
  return requireSession(MANAGEMENT_ROLES);
}

export async function requireOwnerSession() {
  return requireSession(OWNER_ONLY);
}

export function orgIdOf(session: SessionUser) {
  return session.membership.organization.id;
}

export function isOwner(session: SessionUser) {
  return session.membership.role === "OWNER";
}

export function isAdmin(session: SessionUser) {
  return session.membership.role === "ADMIN";
}

export function isStaff(session: SessionUser) {
  return session.membership.role === "STAFF";
}
