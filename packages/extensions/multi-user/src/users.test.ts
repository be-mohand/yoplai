import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEligibleAccount } from "./users.js";

describe("getEligibleAccount", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT, approved INTEGER, role TEXT, banned INTEGER)");
    const insert = db.prepare('INSERT INTO user (id, name, email, approved, role, banned) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run("ok", "Ok", "ok@example.com", 1, "user", 0);
    insert.run("pending", "P", "p@example.com", 0, "user", 0);
    insert.run("admin", "A", "a@example.com", 0, "admin", 0);
    insert.run("root", "R", "r@example.com", 0, "superadmin", 0);
    insert.run("banned", "B", "b@example.com", 1, "admin", 1);
  });
  afterEach(() => db.close());

  it("returns fresh id/email/role for approved users and unapproved staff", () => {
    expect(getEligibleAccount(db, "ok")).toEqual({ id: "ok", email: "ok@example.com", role: "user" });
    expect(getEligibleAccount(db, "admin")?.role).toBe("admin");
    expect(getEligibleAccount(db, "root")?.role).toBe("superadmin");
  });

  it("refuses missing, unapproved, and banned accounts", () => {
    expect(getEligibleAccount(db, "nobody")).toBeUndefined();
    expect(getEligibleAccount(db, "pending")).toBeUndefined();
    expect(getEligibleAccount(db, "banned")).toBeUndefined();
  });
});
