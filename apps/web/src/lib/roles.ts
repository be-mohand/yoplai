/** A better-auth session role: one string, a list, or absent. Comma-joined strings are not split. */
export type SessionRole = string | string[] | null | undefined;

const STAFF_ROLES = ["admin", "superadmin"];

/** True for admins and superadmins. */
export function hasStaffRole(role: SessionRole): boolean {
  if (Array.isArray(role)) return role.some((r) => STAFF_ROLES.includes(r));
  return typeof role === "string" && STAFF_ROLES.includes(role);
}

export function isSuperadmin(role: SessionRole): boolean {
  if (Array.isArray(role)) return role.includes("superadmin");
  return role === "superadmin";
}
