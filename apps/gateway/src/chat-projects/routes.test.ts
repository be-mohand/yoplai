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
