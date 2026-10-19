import fs from "node:fs/promises";
import path from "node:path";
import type { GatewayConfig } from "@yoplai/shared";
import { writeJsonAtomic } from "../util/atomic-write.js";
import { listDashboardSlugs, openDashboardFile } from "./dashboard-files.js";
import { getDashboardRegistry } from "./store.js";

async function exists(file: string): Promise<boolean> {
  try { await fs.stat(file); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function hasPriorRuns(home: string): Promise<boolean> {
  for (const directory of ["sessions", "history"]) {
    try {
      const files = await fs.readdir(path.join(home, directory), { recursive: true });
      if (files.some((file) => file.endsWith(".jsonl"))) return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return false;
}

/** Called before extension startup: scheduler and HTTP must not precede migration. */
export async function initializeDashboardRegistry(config: GatewayConfig, home: string): Promise<void> {
  const marker = path.join(home, "canvas", "schema.json");
  if (await exists(marker)) return;
  const registryFile = path.join(home, "canvas", "registry.json");
  // Existing registrations, auth state or run history identify an upgraded home.
  // Merely configured agents and draft files also occur in fresh installations.
  const upgrade = await exists(registryFile) || await exists(path.join(home, "auth.db")) || await hasPriorRuns(home);
  if (upgrade) {
    const registry = getDashboardRegistry(registryFile);
    for (const agent of config.agents) {
      for (const slug of await listDashboardSlugs(agent)) {
        const file = await openDashboardFile(agent, slug);
        try { await file.readFile("utf8"); } finally { await file.close(); }
        await registry.link(agent.id, slug);
      }
    }
  }
  await writeJsonAtomic(marker, { version: 1, migrationComplete: true });
}
