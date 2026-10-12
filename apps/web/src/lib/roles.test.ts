import { describe, expect, it } from "vitest";
import { hasStaffRole, isSuperadmin } from "./roles";

describe("hasStaffRole", () => {
  it("accepts admin and superadmin, as a string or inside an array", () => {
    expect(hasStaffRole("admin")).toBe(true);
    expect(hasStaffRole("superadmin")).toBe(true);
    expect(hasStaffRole(["user", "admin"])).toBe(true);
    expect(hasStaffRole(["superadmin"])).toBe(true);
  });

  it("rejects plain users and missing roles", () => {
    expect(hasStaffRole("user")).toBe(false);
    expect(hasStaffRole(["user"])).toBe(false);
    expect(hasStaffRole([])).toBe(false);
    expect(hasStaffRole(null)).toBe(false);
    expect(hasStaffRole(undefined)).toBe(false);
  });

  it("does not split comma-joined strings", () => {
    expect(hasStaffRole("user,admin")).toBe(false);
  });
});

describe("isSuperadmin", () => {
  it("accepts superadmin as a string or inside an array", () => {
    expect(isSuperadmin("superadmin")).toBe(true);
    expect(isSuperadmin(["user", "superadmin"])).toBe(true);
  });

  it("rejects admins, users, missing roles and comma-joined strings", () => {
    expect(isSuperadmin("admin")).toBe(false);
    expect(isSuperadmin(["admin"])).toBe(false);
    expect(isSuperadmin(null)).toBe(false);
    expect(isSuperadmin(undefined)).toBe(false);
    expect(isSuperadmin("admin,superadmin")).toBe(false);
  });
});
