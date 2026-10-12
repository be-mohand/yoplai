import type Database from "better-sqlite3";

export type EligibleAccount = { id: string; email: string; role: string };

type UserRow = { id: string; email: string; approved: number; role: string; banned: number };

/**
 * Fresh (database) lookup of an account that may use the platform: exists, not
 * banned, and approved or admin/superadmin. Returns undefined otherwise.
 */
export function getEligibleAccount(db: Database.Database, userId: string): EligibleAccount | undefined {
  const user = db.prepare("SELECT id, email, approved, role, banned FROM user WHERE id = ?").get(userId) as UserRow | undefined;
  if (!user || user.banned || (!user.approved && !["admin", "superadmin"].includes(user.role))) return undefined;
  return { id: user.id, email: user.email, role: user.role };
}
