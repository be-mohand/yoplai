import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatProjectStore, isSafeChatProjectId } from "./store.js";

describe("ChatProjectStore", () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "chat-projects-")); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it("persists CRUD, unique ids and user isolation", async () => {
    const store = new ChatProjectStore(dir, "alice");
    expect(await store.list()).toEqual([]);
    const project = await store.create("  Research  ");
    const other = await store.create("Research");
    expect(project.name).toBe("Research");
    expect(other.id).not.toBe(project.id);
    expect(isSafeChatProjectId(project.id)).toBe(true);
    expect(await new ChatProjectStore(dir, "alice").get(project.id)).toEqual(project);
    expect(await new ChatProjectStore(dir, "bob").get(project.id)).toBeNull();
    expect(await new ChatProjectStore(dir).list()).toEqual([]);
    expect(await store.update(project.id, "Renamed")).toMatchObject({ ...project, name: "Renamed", updatedAt: expect.any(Number) });
    expect(await store.delete(project.id)).toBe(true);
    expect(await store.delete(project.id)).toBe(false);
    expect(await store.list()).toEqual([other]);
    expect(await store.update(project.id, "Missing")).toBeNull();
  });

  it("stores instructions independently of the name and supports clearing them", async () => {
    const store = new ChatProjectStore(dir);
    const project = await store.create("Research");
    await store.update(project.id, { instructions: "Use primary sources." });
    await store.update(project.id, { name: "Work" });
    expect(await store.get(project.id)).toMatchObject({ name: "Work", instructions: "Use primary sources." });
    await store.update(project.id, { instructions: "" });
    expect(await store.get(project.id)).toMatchObject({ instructions: "" });
  });

  it("rejects unsafe paths and empty or oversized names", async () => {
    const store = new ChatProjectStore(dir);
    for (const id of ["", "..", "../escape", "a/b", "a\\b", "\0", "a".repeat(101)]) {
      await expect(store.get(id)).rejects.toThrow("Invalid project id");
      await expect(store.update(id, "Name")).rejects.toThrow("Invalid project id");
      await expect(store.delete(id)).rejects.toThrow("Invalid project id");
    }
    expect(() => new ChatProjectStore(dir, "../escape")).toThrow("Invalid user id");
    await expect(store.create(" ")).rejects.toThrow("Project name");
    await expect(store.create("x".repeat(201))).rejects.toThrow("Project name");
    expect(await fs.readdir(dir)).toEqual([]);
  });
});
