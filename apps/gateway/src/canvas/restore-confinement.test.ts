import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { AgentConfig, GatewayConfig } from "@yoplai/shared";
import { canvasExtension } from "./index.js";
import { getDashboardRegistry } from "./store.js";

it("restoring a missing file refuses a symlink dashboard directory without writing through it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard-restore-confinement-"));
  try {
    const directory = path.join(root, "data", "dashboards");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "page.html"), "<h1>RETAINED</h1>");
    await canvasExtension.start({ getDataDir: () => root } as never);
    const agent = { id: "agent", name: "Agent", workspace: root } as AgentConfig;
    const config = { agents: [agent], canvas: { enabled: true } } as GatewayConfig;
    const tools = await canvasExtension.getAgentTools!(agent, { config });
    await tools.find((tool) => tool.name === "dashboard_create")!.execute({ slug: "page.html" }, {} as never);
    const registry = getDashboardRegistry(path.join(root, "canvas", "registry.json"));
    const [entry] = await registry.list(agent.id);
    const [version] = await registry.listVersions(entry.id);
    await fs.rm(directory, { recursive: true });
    const outside = path.join(root, "outside");
    await fs.mkdir(outside);
    await fs.symlink(outside, directory, "dir");
    await expect(tools.find((tool) => tool.name === "dashboard_versions")!.execute({ slug: "page.html", restore: version.id }, {} as never)).rejects.toThrow("not found");
    expect(await fs.readdir(outside)).toEqual([]);
    expect(await registry.readPublished(entry.id)).toBe("<h1>RETAINED</h1>");
  } finally {
    await canvasExtension.stop();
    await fs.rm(root, { recursive: true, force: true });
  }
});
