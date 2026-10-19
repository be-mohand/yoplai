import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayConfigSchema, type ExtensionContext } from "@yoplai/shared";
import { getMultiUserRuntime, multiUserExtension, type RequestAuthContext } from "@yoplai/extension-multi-user";
import { schedulerExtension } from "./index.js";
import { clearSchedulerContext, getScheduler, getSchedulerContext, setSchedulerContext, stopScheduler } from "./service.js";

describe("scheduled-job agent access", () => {
  let home: string;
  let app: Hono;
  let actor: RequestAuthContext;
  let jobId: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "scheduler-access-"));
    const poolDir = path.join(home, "pool", "alpha");
    await fs.mkdir(poolDir, { recursive: true });
    await fs.writeFile(path.join(poolDir, "agent.yaml"), "id: alpha\nname: Alpha\n");
    const config = GatewayConfigSchema.parse({
      agents: [{ id: "alpha", name: "Alpha", workspace: path.join(home, "agents", "alpha"), model: { provider: "test", model: "test" } }],
      pool: [{ id: "alpha", name: "Alpha", workspace: poolDir, workspaceDir: poolDir, model: { provider: "test", model: "test" } }],
      extensions: { scheduler: {}, multiUser: { enabled: true, emailAndPassword: { enabled: true }, sessionSecret: "scheduler-test-secret-at-least-32-characters" } },
    });
    const ctx: ExtensionContext = {
      getConfig: () => config, getDataDir: () => home, reloadConfig: () => {},
      getAgent: (id) => config.agents.find((agent) => agent.id === id), getAgents: () => config.agents,
      isAgentActive: () => true, isAgentStreaming: () => false,
      resolveWorkspaceDir: (agent) => agent.workspaceDir ?? agent.workspace,
      runAgent: vi.fn(async () => ({ payloads: [{ text: "done" }], meta: { sessionId: "test", durationMs: 0 } })),
      getSubagentTemplates: () => [], resolveSessionId: vi.fn(), getSessionEntry: vi.fn(),
      hasSession: async () => false, resetSession: async () => {},
      ensureSession: async () => ({ sessionId: "test", updatedAt: 0 }),
      clearSessionEntry: vi.fn(), restoreSessionUpdatedAt: vi.fn(), deleteSession: vi.fn(),
      invalidateHistoryCache: vi.fn(), getSessionHistory: vi.fn(), saveMediaFile: vi.fn(), readMediaFile: vi.fn(),
      registerDeliverySink: vi.fn(() => () => {}), getDeliverySink: () => undefined,
      subscribe: vi.fn(() => () => {}), emit: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
    await multiUserExtension.start!(ctx);
    const runtime = getMultiUserRuntime()!;
    for (const [id, role] of [["manager", "admin"], ["foreign", "admin"], ["root", "superadmin"], ["member", "user"]]) {
      runtime.db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, approved) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 1)').run(id, id, `${id}@test.example`, role);
    }
    const team = runtime.teams.createTeam({ name: "Owners", createdBy: "root" });
    runtime.membership.setMembers(team.id, { mode: "list", userIds: ["manager"] }, "root");
    runtime.forks.setTeams("alpha", { mode: "list", teamIds: [team.id] }, "root");
    actor = { user: { id: "foreign", role: "admin", approved: true }, session: { id: "test", userId: "foreign" } };
    setSchedulerContext(ctx);
    const authenticated = new Hono<{ Variables: { multiUserAuthContext: RequestAuthContext } }>().basePath("/api");
    authenticated.use("*", async (c, next) => { c.set("multiUserAuthContext", actor); await next(); });
    const routes = new Hono();
    schedulerExtension.registerRoutes!(routes);
    authenticated.route("/", routes);
    app = new Hono().route("/", authenticated);
    const job = await getScheduler().add("alpha", { name: "Team task", credentialMode: "team", schedule: { cron: "0 8 * * *", tz: "UTC" }, payload: { message: "hello" } }, "manager");
    jobId = job.id;
  });

  afterEach(async () => {
    await stopScheduler();
    clearSchedulerContext();
    await multiUserExtension.stop!();
    await fs.rm(home, { recursive: true, force: true });
  });

  it("refuses a foreign admin listing a Private agent's Team jobs", async () => {
    expect((await app.request("/api/schedules?agent=alpha")).status).toBe(403);
  });

  it("omits inaccessible agents from an agentless list", async () => {
    expect(await (await app.request("/api/schedules")).json()).toEqual([]);
  });

  it.each(["create", "tail", "run", "update", "delete"])("refuses %s for a Private agent outside the caller's teams", async (operation) => {
    const url = operation === "create" ? "/api/schedules" : `/api/schedules/alpha/${jobId}${operation === "tail" || operation === "run" ? `/${operation}` : ""}`;
    const method = operation === "create" || operation === "run" ? "POST" : operation === "update" ? "PATCH" : operation === "delete" ? "DELETE" : "GET";
    const body = operation === "create" ? { agentId: "alpha", name: "Intrusion", schedule: { cron: "0 8 * * *", tz: "UTC" }, payload: { message: "hello" } } : operation === "update" ? { name: "Intrusion" } : undefined;
    expect((await app.request(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).status).toBe(403);
  });

  it.each([["foreign", "admin", false], ["member", "user", false], ["manager", "admin", true], ["root", "superadmin", true]] as const)("limits Public Team-job management for %s through REST and tools", async (id, role, allowed) => {
    getMultiUserRuntime()!.forks.setPublic("alpha", true);
    actor = { user: { id, role, approved: true }, session: { id: "test", userId: id } };
    const ctx = getSchedulerContext();
    const agent = ctx.getAgent("alpha")!;
    const tools = await schedulerExtension.getAgentTools!(agent);
    for (const enabled of [false, true]) {
      // Ensure each pause/resume actually changes state even after a refusal.
      await getScheduler().update("alpha", jobId, { enabled: !enabled }, "manager");
      const res = await app.request(`/api/schedules/alpha/${jobId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      expect(res.status).toBe(allowed ? 200 : 403);
      await getScheduler().update("alpha", jobId, { enabled: !enabled }, "manager");
      const result = await tools.find((tool) => tool.name === "scheduler.update_job")!.execute({ jobId, enabled }, { agent, config: ctx.getConfig(), userId: id });
      expect(result).toMatchObject({ ok: allowed });
    }
    const toolResult = await tools.find((tool) => tool.name === "scheduler.delete_job")!.execute({ jobId }, { agent, config: ctx.getConfig(), userId: id });
    expect(toolResult).toMatchObject({ ok: allowed });
    const restJob = await getScheduler().add("alpha", { name: "Delete through REST", credentialMode: "team", schedule: { cron: "0 8 * * *", tz: "UTC" }, payload: { message: "hello" } }, "manager");
    expect((await app.request(`/api/schedules/alpha/${restJob.id}`, { method: "DELETE" })).status).toBe(allowed ? 200 : 403);
  });

  it("lets a teamless Public user create and edit Team jobs and manage only their own Mine jobs", async () => {
    getMultiUserRuntime()!.forks.setPublic("alpha", true);
    actor = { user: { id: "member", role: "user", approved: true }, session: { id: "test", userId: "member" } };
    const body = { agentId: "alpha", name: "Shared", credentialMode: "team", schedule: { cron: "0 8 * * *", tz: "UTC" }, payload: { message: "hello" } };
    const created = await app.request("/api/schedules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(created.status).toBe(201);
    const team = await created.json();
    const edited = await app.request(`/api/schedules/alpha/${team.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Edited by member" }) });
    expect(await edited.json()).toMatchObject({ name: "Edited by member" });
    const listed = await (await app.request("/api/schedules")).json();
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ id: team.id })]));
    const mine = await getScheduler().add("alpha", { ...body, credentialMode: "owner" }, "member");
    const pause = await app.request(`/api/schedules/alpha/${mine.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: false }) });
    expect(pause.status).toBe(200);
    const ctx = getSchedulerContext();
    const agent = ctx.getAgent("alpha")!;
    const tools = await schedulerExtension.getAgentTools!(agent);
    expect(await tools.find((tool) => tool.name === "scheduler.update_job")!.execute({ jobId: mine.id, enabled: true }, { agent, config: ctx.getConfig(), userId: "member" })).toMatchObject({ ok: true });
    actor = { user: { id: "manager", role: "admin", approved: true }, session: { id: "test", userId: "manager" } };
    expect((await app.request(`/api/schedules/alpha/${mine.id}`, { method: "DELETE" })).status).toBe(403);
    actor = { user: { id: "member", role: "user", approved: true }, session: { id: "test", userId: "member" } };
    expect((await app.request(`/api/schedules/alpha/${mine.id}`, { method: "DELETE" })).status).toBe(200);
  });
});
