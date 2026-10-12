import type { AgentConfig, GatewayConfig } from "@yoplai/shared";
import { dashboardBaseUrl, listDashboardSlugs, normalizeDashboardSlug, openDashboardFile } from "./dashboard-files.js";
import { attributes } from "./sql.js";
import { DashboardRegistry } from "./store.js";

export async function listAgentDashboards(
  agent: AgentConfig,
  registry: DashboardRegistry,
  config: GatewayConfig
) {
  const names = await listDashboardSlugs(agent);

  const dashboards = [];
  for (const slug of names) {
    try {
      const file = await openDashboardFile(agent, slug);
      try {
        const [stat, html] = await Promise.all([file.stat(), file.readFile("utf8")]);
        const title = html.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i)?.[1]
          ?.replace(/<[^>]*>/g, "")
          .trim() || slug;
        let params: string[] = [];
        for (const meta of html.matchAll(/<meta\b([^>]*)>/gi)) {
          const metaAttributes = attributes(meta[1]);
          if (metaAttributes.get("name") !== "yoplai:params") continue;
          params = (metaAttributes.get("content") || "")
            .split(",")
            .map((param) => param.trim())
            .filter(Boolean);
          break;
        }
        const linksTo = new Set<string>();
        for (const match of html.matchAll(/YOPLAI\.link\(\s*["']([^"']+)["']/g)) {
          try {
            const target = normalizeDashboardSlug(match[1]);
            if (target !== slug) linksTo.add(target);
          } catch {
            // Invalid links cannot identify a child dashboard.
          }
        }
        const entry = await registry.link(agent.id, slug);
        dashboards.push({ title, slug, params, linksTo: [...linksTo], updatedAt: stat.mtime.toISOString(), link: `${dashboardBaseUrl(config)}/d/${entry.id}` });
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return dashboards;
}
