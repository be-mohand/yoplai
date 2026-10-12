import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const home = vi.hoisted(() => ({ dir: "" }));
vi.mock("../config/index.js", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  home.dir = nodeFs.mkdtempSync(path.join(nodeOs.tmpdir(), "sh-"));
  return { CONFIG_DIR: home.dir };
});
vi.mock("../sessions/index.js", () => ({ getSessionEntry: async () => null }));
vi.mock("../sessions/store.js", () => ({ getSessionCreatedAt: async () => 0 }));

import type { AgentConfig } from "@yoplai/shared";
import { runSessionHistory } from "./index.js";

const agent = (id: string) => ({ id }) as AgentConfig;

async function writeSession(dir: string, agentId: string, sessionId: string, texts: string[], base: number) {
  await fs.mkdir(dir, { recursive: true });
  const lines = texts.map((t, i) =>
    JSON.stringify({
      type: "history", role: i % 2 ? "assistant" : "user",
      content: [{ type: "text", text: t }], timestamp: base + i * 1000,
    })
  );
  await fs.writeFile(path.join(dir, `${agentId}-${sessionId}.jsonl`), lines.join("\n") + "\n");
}

describe("session_history tool", () => {
  beforeAll(async () => {
    const hist = path.join(home.dir, "history");
    await writeSession(hist, "a1", "old", ["deploy the widget", "ok widget deployed"], 1_700_000_000_000);
    await writeSession(hist, "a1", "cur", ["widget again", "yes"], 1_800_000_000_000);
    await writeSession(hist, "a2", "other", ["widget secret of agent two"], 1_800_000_000_000);
    const userHist = path.join(home.dir, "sessions", "users", "u1", "history");
    await writeSession(userHist, "a1", "mine", ["widget for user one"], 1_800_000_000_000);
  });
  afterAll(() => fs.rm(home.dir, { recursive: true, force: true }));

  it("lists own sessions newest first and marks the current one", async () => {
    const out = await runSessionHistory({ action: "list" }, { agent: agent("a1"), sessionId: "cur" });
    expect(out.split("\n")[0]).toContain("cur");
    expect(out).toContain("★ CURRENT SESSION");
    expect(out).toContain("old");
    expect(out).not.toContain("other");
  });

  it("searches only the agent's own sessions and labels the current session", async () => {
    const out = await runSessionHistory({ action: "search", query: "WIDGET" }, { agent: agent("a1"), sessionId: "cur" });
    expect(out).toContain("session cur ★ CURRENT SESSION");
    expect(out).toContain("[current session — earlier messages compacted");
    expect(out).toContain("session old");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("user one");
  });

  it("scopes to the calling user's history dir", async () => {
    const out = await runSessionHistory({ action: "search", query: "widget" }, { agent: agent("a1"), userId: "u1" });
    expect(out).toContain("user one");
    expect(out).not.toContain("deploy the widget");
  });

  it("reads a session, refuses other agents' sessions", async () => {
    const read = await runSessionHistory({ action: "read", session: "old" }, { agent: agent("a1"), sessionId: "cur" });
    expect(read).toContain("#0 user");
    expect(read).not.toContain("[current session");
    const cur = await runSessionHistory({ action: "read", session: "cur" }, { agent: agent("a1"), sessionId: "cur" });
    expect(cur).toContain("[current session");
    expect(await runSessionHistory({ action: "read", session: "other" }, { agent: agent("a1") })).toContain("no such session");
  });

  it("stops search at limit", async () => {
    const out = await runSessionHistory({ action: "search", query: "widget", limit: 1 }, { agent: agent("a1") });
    expect(out.match(/^\s+#\d+/gm)).toHaveLength(1);
  });
});
