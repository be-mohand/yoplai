import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentConfig, GatewayConfig } from "@yoplai/shared";
import { canvasExtension } from "./index.js";
import { listAgentDashboards } from "./list.js";
import { createDashboardRoutes } from "./routes.js";
import { DashboardRegistry } from "./store.js";

let root: string;
let dir: string;
let registry: DashboardRegistry;
const config = {
  agents: [],
  canvas: { enabled: true, baseUrl: "https://yoplai.test" },
} as unknown as GatewayConfig;
const agent = (): AgentConfig =>
  ({ id: "agent-1", name: "Agent", workspace: path.join(root, "agent") }) as AgentConfig;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "canvas-listing-"));
  dir = path.join(root, "agent", "data", "dashboards");
  await fs.mkdir(dir, { recursive: true });
  registry = new DashboardRegistry(path.join(root, "registry.json"));
  await fs.writeFile(path.join(dir, "b.html"), "<h1>b</h1>");
  await fs.writeFile(path.join(dir, "a.html"), "<h1>a</h1>");
  await fs.writeFile(path.join(dir, "notes.txt"), "x");
  await fs.writeFile(path.join(dir, ".html"), "x");
  await fs.mkdir(path.join(dir, "child.html"));
});

afterEach(async () => {
  await canvasExtension.stop();
  await fs.rm(root, { recursive: true, force: true });
});

describe("dashboard file enumeration", () => {
  it("list API: sorted regular .html files only", async () => {
    const list = await listAgentDashboards(agent(), registry, config);
    expect(list.map((d) => d.slug)).toEqual(["a.html", "b.html"]);
  });

  it("list API: missing directory yields empty list", async () => {
    await fs.rm(dir, { recursive: true });
    expect(await listAgentDashboards(agent(), registry, config)).toEqual([]);
  });

  it("dashboard_link discovery: sorted regular .html files only", async () => {
    await canvasExtension.start({ getDataDir: () => root } as never);
    const [tool] = await canvasExtension.getAgentTools!(agent(), { config });
    const result = (await tool.execute({}, {} as never)) as { slug: string }[];
    expect(result.map((d) => d.slug)).toEqual(["a.html", "b.html"]);
  });

  it("dashboard_link discovery: missing directory yields empty list", async () => {
    await fs.rm(dir, { recursive: true });
    await canvasExtension.start({ getDataDir: () => root } as never);
    const [tool] = await canvasExtension.getAgentTools!(agent(), { config });
    expect(await tool.execute({}, {} as never)).toEqual([]);
  });

  it("viewer link map: only regular .html files, not directories", async () => {
    const entry = await registry.link("agent-1", "a.html");
    const routes = createDashboardRoutes({
      getConfig: () => config,
      getAgent: () => agent(),
      registry,
      authenticate: async () => ({ user: {} }),
      hasAgentAccess: async () => true,
    });
    const html = await (await routes.request(`/${entry.id}`)).text();
    expect(html).toContain('"a.html":"/d/');
    expect(html).toContain('"b.html":"/d/');
    expect(html).not.toContain("child.html");
    expect(html).not.toContain("notes.txt");
  });
});
