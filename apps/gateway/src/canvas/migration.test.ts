import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentConfig, GatewayConfig } from "@yoplai/shared";
import { initializeDashboardRegistry } from "./migration.js";
import { DashboardRegistry } from "./store.js";

let root: string;
let agent: AgentConfig;
let config: GatewayConfig;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard-migration-"));
  agent = { id: "agent", name: "Agent", workspace: path.join(root, "workspace") } as AgentConfig;
  config = { agents: [agent] } as GatewayConfig;
  await fs.mkdir(path.join(agent.workspace, "data", "dashboards"), { recursive: true });
  await fs.writeFile(path.join(agent.workspace, "data", "dashboards", "legacy.html"), "LEGACY");
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });

it("upgrades registered and disk-only dashboards once, retries safely, and ignores later drafts", async () => {
  const registry = new DashboardRegistry(path.join(root, "canvas", "registry.json"));
  const existing = await registry.link(agent.id, "registered.html");
  await initializeDashboardRegistry(config, root);
  expect((await registry.list(agent.id)).map((entry) => entry.slug).sort()).toEqual(["legacy.html", "registered.html"]);
  expect(await registry.get(existing.id)).toMatchObject({ id: existing.id, slug: "registered.html" });
  await fs.writeFile(path.join(agent.workspace, "data", "dashboards", "later.html"), "DRAFT");
  await initializeDashboardRegistry(config, root);
  expect((await registry.list(agent.id)).map((entry) => entry.slug).sort()).toEqual(["legacy.html", "registered.html"]);
  const fresh = path.join(root, "fresh");
  await initializeDashboardRegistry(config, fresh);
  expect(await new DashboardRegistry(path.join(fresh, "canvas", "registry.json")).all()).toEqual([]);
});

it("retries an interrupted import without duplicates and uses sandbox host storage", async () => {
  vi.stubEnv("YOPLAI_HOME", root);
  await fs.writeFile(path.join(root, "auth.db"), "upgrade marker");
  const broken = { id: "broken", name: "Broken", workspace: path.join(root, "broken") } as AgentConfig;
  await fs.writeFile(broken.workspace, "not a directory");
  config.agents.push(broken);
  await expect(initializeDashboardRegistry(config, root)).rejects.toThrow();
  await expect(fs.stat(path.join(root, "canvas", "schema.json"))).rejects.toThrow();
  const registry = new DashboardRegistry(path.join(root, "canvas", "registry.json"));
  expect((await registry.list(agent.id)).map((entry) => entry.slug)).toEqual(["legacy.html"]);
  await fs.rm(broken.workspace);
  const sandbox = { id: "sandbox", name: "Sandbox", workspace: "/workspace", sandbox: { enabled: true } } as AgentConfig;
  config.agents.push(sandbox);
  const { dashboardDirectory } = await import("./dashboard-files.js");
  await fs.mkdir(dashboardDirectory(sandbox), { recursive: true });
  await fs.writeFile(path.join(dashboardDirectory(sandbox), "sandbox.html"), "SANDBOX");
  await initializeDashboardRegistry(config, root);
  expect((await registry.list(agent.id)).map((entry) => entry.slug)).toEqual(["legacy.html"]);
  expect((await registry.list("sandbox")).map((entry) => entry.slug)).toEqual(["sandbox.html"]);
  expect(JSON.parse(await fs.readFile(path.join(root, "canvas", "schema.json"), "utf8"))).toEqual({ version: 1, migrationComplete: true });
});
