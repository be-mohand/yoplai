import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMainAgentRoutes } from "./routes.js";

let dataDir: string;
beforeEach(async () => { dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-agent-api-")); });
afterEach(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });

describe("main agent preference API", () => {
  it("returns an empty preference when no record exists", async () => {
    const routes = createMainAgentRoutes({ dataDir, getUserId: async () => undefined, getEligibleAgents: async () => [] });
    const response = await routes.request("/me/main-agent");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mainAgentId: null, accessible: false, pickerDismissedAt: null });
  });
});

it("persists a single-user main agent across route instances without a user object", async () => {
  const createRoutes = () => createMainAgentRoutes({ dataDir, getUserId: async () => undefined, getEligibleAgents: async () => [{ id: "assistant" }] });
  const saved = await createRoutes().request("/me/main-agent", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mainAgentId: "assistant" }) });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({ mainAgentId: "assistant", accessible: true, pickerDismissedAt: null });
  expect(await (await createRoutes().request("/me/main-agent")).json()).toEqual({ mainAgentId: "assistant", accessible: true, pickerDismissedAt: null });
});


it("records dismissals using server time and clears them when choosing an agent", async () => {
  const routes = createMainAgentRoutes({ dataDir, getUserId: async () => undefined, getEligibleAgents: async () => [{ id: "assistant" }] });
  const put = (body: unknown) => routes.request("/me/main-agent", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T10:11:12.000Z"));
  try {
    const dismissed = await put({ pickerDismissedAt: "2000-01-01T00:00:00.000Z" });
    expect(dismissed.status).toBe(200);
    expect(await dismissed.json()).toEqual({ mainAgentId: null, accessible: false, pickerDismissedAt: "2026-10-19T10:11:12.000Z" });
    expect(await (await routes.request("/me/main-agent")).json()).toEqual({ mainAgentId: null, accessible: false, pickerDismissedAt: "2026-10-19T10:11:12.000Z" });
    expect(await (await put({ mainAgentId: "assistant" })).json()).toEqual({ mainAgentId: "assistant", accessible: true, pickerDismissedAt: null });
  } finally { vi.useRealTimers(); }
});

it("deletes the complete preference and permits clearing an empty record", async () => {
  const routes = createMainAgentRoutes({ dataDir, getUserId: async () => undefined, getEligibleAgents: async () => [{ id: "assistant" }] });
  await routes.request("/me/main-agent", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mainAgentId: "assistant" }) });
  await routes.request("/me/main-agent", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ pickerDismissedAt: "now" }) });
  for (let i = 0; i < 2; i++) {
    const response = await routes.request("/me/main-agent", { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mainAgentId: null, accessible: false, pickerDismissedAt: null });
    expect(await (await routes.request("/me/main-agent")).json()).toEqual({ mainAgentId: null, accessible: false, pickerDismissedAt: null });
  }
});

it("rejects invalid preference updates without replacing the saved choice", async () => {
  const routes = createMainAgentRoutes({ dataDir, getUserId: async () => undefined, getEligibleAgents: async () => [{ id: "assistant" }] });
  const put = (body: string) => routes.request("/me/main-agent", { method: "PUT", headers: { "content-type": "application/json" }, body });
  expect((await put('{"mainAgentId":"assistant"}')).status).toBe(200);
  for (const body of ["{", "null", "{}", '{"mainAgentId":1}', '{"mainAgentId":"assistant","pickerDismissedAt":"now"}']) {
    expect((await put(body)).status).toBe(400);
  }
  expect(await (await routes.request("/me/main-agent")).json()).toEqual({ mainAgentId: "assistant", accessible: true, pickerDismissedAt: null });
});
