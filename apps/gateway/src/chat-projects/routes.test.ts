import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ dir: "" }));
vi.mock("../config/index.js", () => ({ get CONFIG_DIR() { return config.dir; } }));
vi.mock("../history/store.js", () => ({ appendSessionMeta: vi.fn() }));
import { createChatProjectRoutes } from "./routes.js";
import { ChatProjectStore } from "./store.js";

beforeEach(async () => { config.dir = await fs.mkdtemp(path.join(os.tmpdir(), "project-files-api-")); });
afterEach(async () => { await fs.rm(config.dir, { recursive: true, force: true }); });

describe("chat project files API", () => {
  it("uploads, extracts, lists and deletes originals with user isolation", async () => {
    const store = new ChatProjectStore(config.dir, "alice");
    const project = await store.create("Research");
    const routes = createChatProjectRoutes({ getUserId: async (c) => c.req.header("x-user") ?? "alice", getAgentIds: () => [] });
    const body = new FormData();
    body.append("file", new File(["Useful project notes"], "notes.txt", { type: "text/plain" }));
    const upload = await routes.request(`/chat-projects/${project.id}/files`, { method: "POST", body });
    expect(upload.status).toBe(201);
    const file = await upload.json();
    expect((await store.listFiles(project.id))[0]?.text).toBe("Useful project notes");
    expect(await fs.readFile(path.join(store.filesDirectory(project.id), file.id), "utf8")).toBe("Useful project notes");
    const listed = await routes.request(`/chat-projects/${project.id}/files`);
    expect(await listed.json()).toMatchObject({ items: [{ name: "notes.txt", extracted: true }] });
    expect((await routes.request(`/chat-projects/${project.id}/files`, { headers: { "x-user": "bob" } })).status).toBe(404);
    const foreignUpload = new FormData();
    foreignUpload.append("file", new File(["Foreign"], "foreign.txt", { type: "text/plain" }));
    expect((await routes.request(`/chat-projects/${project.id}/files`, { method: "POST", body: foreignUpload, headers: { "x-user": "bob" } })).status).toBe(404);
    expect((await routes.request(`/chat-projects/${project.id}/files/${file.id}`, { method: "DELETE", headers: { "x-user": "bob" } })).status).toBe(404);
    expect(await store.listFiles(project.id)).toHaveLength(1);
    expect((await routes.request(`/chat-projects/${project.id}/files/${file.id}`, { method: "DELETE" })).status).toBe(200);
    expect(await store.listFiles(project.id)).toEqual([]);
    expect(await fs.readdir(store.filesDirectory(project.id))).toEqual([]);
  });

  it("retains the original and warns when document extraction fails", async () => {
    const store = new ChatProjectStore(config.dir);
    const project = await store.create("Research");
    const routes = createChatProjectRoutes({ getUserId: async () => undefined, getAgentIds: () => [] });
    const body = new FormData();
    body.append("file", new File(["Invalid office document"], "broken.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const upload = await routes.request(`/chat-projects/${project.id}/files`, { method: "POST", body });
    expect(upload.status).toBe(201);
    const file = await upload.json();
    expect((await store.listFiles(project.id))[0]?.extractionError).toContain("original file is retained");
    expect(await fs.readFile(path.join(store.filesDirectory(project.id), file.id), "utf8")).toBe("Invalid office document");
    const listed = await routes.request(`/chat-projects/${project.id}/files`);
    expect(await listed.json()).toMatchObject({ items: [{ extracted: false, extractionError: expect.any(String) }] });
  });

  it("rejects unsupported uploads without storing files", async () => {
    const store = new ChatProjectStore(config.dir);
    const project = await store.create("Research");
    const routes = createChatProjectRoutes({ getUserId: async () => undefined, getAgentIds: () => [] });
    const body = new FormData();
    body.append("file", new File(["code"], "script.exe", { type: "text/plain" }));
    expect((await routes.request(`/chat-projects/${project.id}/files`, { method: "POST", body })).status).toBe(400);
    expect(await store.listFiles(project.id)).toEqual([]);
  });
});


describe("chat project memory API", () => {
  it("lists and removes references without exposing paths, and edits notes in the owning user scope", async () => {
    const store = new ChatProjectStore(config.dir, "alice");
    const project = await store.create("Memory");
    const reference = await store.addReference(project.id, { title: "Wiki", description: "Useful source", path: "/private/wiki" });
    const routes = createChatProjectRoutes({ getUserId: async (c) => c.req.header("x-user") ?? "alice", getAgentIds: () => [] });
    const base = "/chat-projects/" + project.id;
    const listed = await routes.request(base + "/references");
    expect(await listed.json()).toEqual({ items: [{ id: reference.id, title: "Wiki", description: "Useful source", createdAt: reference.createdAt }] });
    for (const suffix of ["/references", "/notes"]) expect((await routes.request(base + suffix, { headers: { "x-user": "bob" } })).status).toBe(404);
    expect((await routes.request(base + "/references/" + reference.id, { method: "DELETE", headers: { "x-user": "bob" } })).status).toBe(404);
    const put = (text: unknown, user = "alice") => routes.request(base + "/notes", { method: "PUT", headers: { "content-type": "application/json", "x-user": user }, body: JSON.stringify({ text }) });
    expect((await put("Foreign", "bob")).status).toBe(404);
    expect((await put(123)).status).toBe(400);
    expect((await put("Editable notes")).status).toBe(200);
    expect(await (await routes.request(base + "/notes")).json()).toEqual({ text: "Editable notes" });
    expect((await put("")).status).toBe(200);
    expect(await store.getNotes(project.id)).toBe("");
    expect((await routes.request(base + "/references/" + reference.id, { method: "DELETE" })).status).toBe(200);
    expect((await routes.request(base + "/references/" + reference.id, { method: "DELETE" })).status).toBe(404);
    expect(await store.listReferences(project.id)).toEqual([]);
  });
});
