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

  it("stores originals, metadata and deletions within the owning user project", async () => {
    const store = new ChatProjectStore(dir, "alice");
    const project = await store.create("Research");
    const file = { id: "file-1", name: "notes.txt", mimeType: "text/plain", size: 5, createdAt: 1, text: "Notes" };
    await store.addFile(project.id, file, Buffer.from("Notes"));
    expect(await fs.readFile(path.join(store.filesDirectory(project.id), file.id), "utf8")).toBe("Notes");
    expect(await store.listFiles(project.id)).toEqual([file]);
    expect(await new ChatProjectStore(dir, "bob").listFiles(project.id)).toEqual([]);
    expect(await store.deleteFile(project.id, "../escape").catch((error: Error) => error.message)).toBe("Invalid file id");
    expect(await store.deleteFile(project.id, file.id)).toBe(true);
    expect(await store.listFiles(project.id)).toEqual([]);
    expect(await fs.readdir(store.filesDirectory(project.id))).toEqual([]);
    expect(await store.deleteFile(project.id, file.id)).toBe(false);
  });

  it("serializes concurrent file mutations across store instances", async () => {
    const store = new ChatProjectStore(dir);
    const project = await store.create("Research");
    const files = Array.from({ length: 10 }, (_, index) => ({ id: "file-" + index, name: "notes.txt", mimeType: "text/plain", size: 5, createdAt: 1 }));
    await Promise.all(files.map((file) => new ChatProjectStore(dir).addFile(project.id, file, Buffer.from("Notes"))));
    expect(await store.listFiles(project.id)).toHaveLength(10);
    await Promise.all(files.map((file) => store.deleteFile(project.id, file.id)));
    expect(await store.listFiles(project.id)).toEqual([]);
  });

  it("persists project references and notes with isolated, serialized mutations", async () => {
    const store = new ChatProjectStore(dir, "alice");
    const project = await store.create("Memory");
    expect(await store.listReferences(project.id)).toEqual([]);
    expect(await store.getNotes(project.id)).toBe("");
    const references = await Promise.all(Array.from({ length: 5 }, (_, index) => new ChatProjectStore(dir, "alice").addReference(project.id, { title: "Wiki " + index, description: "Useful", path: "/wiki/" + index })));
    expect(await store.listReferences(project.id)).toEqual(references);
    expect(await new ChatProjectStore(dir, "bob").listReferences(project.id)).toEqual([]);
    await expect(new ChatProjectStore(dir, "bob").appendNotes(project.id, "Foreign")).rejects.toThrow("Project not found");
    await Promise.all([store.appendNotes(project.id, "Sally learned this"), new ChatProjectStore(dir, "alice").appendNotes(project.id, "Casey learned that")]);
    expect(await store.getNotes(project.id)).toMatch(/- \[\d{4}-\d{2}-\d{2}\] Sally learned this\n- \[\d{4}-\d{2}-\d{2}\] Casey learned that\n/);
    expect(await new ChatProjectStore(dir, "bob").getNotes(project.id)).toBe("");
    await store.putNotes(project.id, "Edited notes");
    expect(await new ChatProjectStore(dir, "alice").getNotes(project.id)).toBe("Edited notes");
    await store.putNotes(project.id, "");
    expect(await store.getNotes(project.id)).toBe("");
    expect(await store.deleteReference(project.id, references[0]!.id)).toBe(true);
    expect(await store.deleteReference(project.id, references[0]!.id)).toBe(false);
    expect(await store.listReferences(project.id)).toEqual(references.slice(1));
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
