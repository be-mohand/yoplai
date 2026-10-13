import fs from "node:fs/promises";
import path from "node:path";
import { Hono, type Context } from "hono";
import { getUserHistoryDir } from "@yoplai/extension-multi-user/isolation";
import { CONFIG_DIR } from "../config/index.js";
import { appendSessionMeta } from "../history/store.js";
import { isSafeSessionId, parseSessionFileName } from "../history/sessions.js";
import { ChatProjectStore, isSafeChatProjectId } from "./store.js";

export function createChatProjectRoutes(deps: {
  getUserId: (c: Context) => Promise<string | undefined>;
  getAgentIds: () => string[];
}) {
  const routes = new Hono();
  routes.get("/chat-projects", async (c) => {
    const store = new ChatProjectStore(CONFIG_DIR, await deps.getUserId(c));
    return c.json({ items: await store.list() });
  });
  routes.post("/chat-projects", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!validName(body?.name)) return c.json({ error: "Invalid project name" }, 400);
    const store = new ChatProjectStore(CONFIG_DIR, await deps.getUserId(c));
    return c.json(await store.create(body.name), 201);
  });
  routes.get("/chat-projects/:id", async (c) => {
    const id = c.req.param("id");
    if (!isSafeChatProjectId(id)) return c.json({ error: "Invalid project id" }, 400);
    const store = new ChatProjectStore(CONFIG_DIR, await deps.getUserId(c));
    const project = await store.get(id);
    return project ? c.json(project) : c.json({ error: "Project not found" }, 404);
  });
  routes.patch("/chat-projects/:id", async (c) => {
    const id = c.req.param("id");
    if (!isSafeChatProjectId(id)) return c.json({ error: "Invalid project id" }, 400);
    const body = await c.req.json().catch(() => null);
    if (!body || (body.name === undefined && body.instructions === undefined) ||
      (body.name !== undefined && !validName(body.name)) ||
      (body.instructions !== undefined && typeof body.instructions !== "string")) {
      return c.json({ error: "Invalid project update" }, 400);
    }
    const store = new ChatProjectStore(CONFIG_DIR, await deps.getUserId(c));
    const project = await store.update(id, { name: body.name, instructions: body.instructions });
    return project ? c.json(project) : c.json({ error: "Project not found" }, 404);
  });
  routes.delete("/chat-projects/:id", async (c) => {
    const id = c.req.param("id");
    if (!isSafeChatProjectId(id)) return c.json({ error: "Invalid project id" }, 400);
    const userId = await deps.getUserId(c);
    const store = new ChatProjectStore(CONFIG_DIR, userId);
    if (!await store.get(id)) return c.json({ error: "Project not found" }, 404);
    const dir = getUserHistoryDir(userId, CONFIG_DIR);
    const files = await fs.readdir(dir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const parsed = parseSessionFileName(file, deps.getAgentIds());
      if (parsed && !isSafeSessionId(parsed.sessionId)) continue;
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      let projectId: unknown = null;
      for (const line of raw.split(/\r?\n/)) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === "meta" && entry.key === "project") projectId = entry.value;
        } catch {
          // Ignore malformed history lines, as session summaries do.
        }
      }
      if (projectId !== id) continue;
      if (parsed) {
        await appendSessionMeta(parsed.agentId, parsed.sessionId, "project", null, userId);
      } else {
        // Removed agents still own histories that can reappear when restored.
        await fs.appendFile(path.join(dir, file), JSON.stringify({ type: "meta", key: "project", value: null, timestamp: Date.now() }) + "\n", "utf8");
      }
    }
    await store.delete(id);
    return c.json({ ok: true });
  });
  return routes;
}

function validName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= 200;
}
