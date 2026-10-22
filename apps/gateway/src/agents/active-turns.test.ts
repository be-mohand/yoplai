import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let home: string;
const original = process.env.YOPLAI_HOME;

async function load() {
  vi.resetModules();
  const turns = await import("./active-turns.js");
  const sessions = await import("./sessions.js");
  return { turns, sessions };
}

function readState() {
  const file = path.join(home, "run", "active-turns.json");
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

describe("active turns state file", () => {
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "yoplai-turns-"));
    process.env.YOPLAI_HOME = home;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (original === undefined) delete process.env.YOPLAI_HOME;
    else process.env.YOPLAI_HOME = original;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("warns on one JSON line when state cannot be written and resumes after recovery", async () => {
    const { turns } = await load();
    fs.writeFileSync(path.join(home, "run"), "blocked");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => turns.reportSessionTurns([])).not.toThrow();
    expect(warn.mock.calls).toHaveLength(1);
    expect(warn.mock.calls[0]).toHaveLength(1);
    const line = warn.mock.calls[0]![0];
    expect(line.split("\n")).toHaveLength(1);
    expect(JSON.parse(line)).toMatchObject({
      level: "warn", msg: "[active-turns] failed to write state file",
      message: expect.stringContaining("EEXIST"),
    });

    fs.unlinkSync(path.join(home, "run"));
    turns.reportExtensionWork("worker", [{ kind: "worker", id: "next", startedAt: "2026-10-21T00:00:00.000Z" }]);
    expect(readState().turns).toEqual([{ kind: "worker", id: "next", startedAt: "2026-10-21T00:00:00.000Z" }]);
  });

  it("records a turn on start and clears it on end", async () => {
    const { sessions } = await load();
    sessions.setSessionStreaming("a1", "s1", true, undefined, true);
    let state = readState();
    expect(state.pid).toBe(process.pid);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({ kind: "turn", agentId: "a1", sessionId: "s1" });
    expect(Number.isNaN(Date.parse(state.turns[0].startedAt))).toBe(false);

    sessions.setSessionStreaming("a1", "s1", false);
    state = readState();
    expect(state.turns).toEqual([]);
  });

  it("clears a streaming session when it is deleted", async () => {
    const { sessions } = await load();
    sessions.setSessionStreaming("a1", "s1", true);
    sessions.deleteSession("a1", "s1");
    expect(readState().turns).toEqual([]);
  });

  it("merges extension work and leaves no temp files", async () => {
    const { turns, sessions } = await load();
    sessions.setSessionStreaming("a1", "s1", true);
    turns.reportExtensionWork("subagents", [
      { kind: "subagent", id: "r1", startedAt: new Date().toISOString() },
    ]);
    expect(readState().turns.map((t: { kind: string }) => t.kind).sort()).toEqual(["subagent", "turn"]);
    turns.reportExtensionWork("subagents", []);
    expect(readState().turns).toHaveLength(1);
    expect(fs.readdirSync(path.join(home, "run"))).toEqual(["active-turns.json"]);
  });

  it("resetActiveTurns writes an empty list", async () => {
    const { turns, sessions } = await load();
    sessions.setSessionStreaming("a1", "s1", true);
    turns.resetActiveTurns();
    expect(readState().turns).toEqual([]);
  });
});
