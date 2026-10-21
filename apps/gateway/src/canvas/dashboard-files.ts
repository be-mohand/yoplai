import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { AgentConfig, GatewayConfig } from "@yoplai/shared";
import { resolveHomeDir } from "@yoplai/shared";
import { getAgentDataDir } from "../agents/container.js";
import { isInsideRoot } from "../util/paths.js";
import { serializeByKey } from "../util/serialize.js";

// Dashboard file policy: slugs, locations, confined file operations and
// enumeration. Depends on no other canvas module, so sql/list/routes can use
// it without importing the extension entrypoint.

const dashboardWrites = new Map<string, Promise<void>>();

class DashboardNotFoundError extends Error {
  code = "ENOENT";
}

export function normalizeDashboardSlug(value: string): string {
  if (
    !value ||
    value !== path.posix.basename(value) ||
    path.posix.extname(value).toLowerCase() !== ".html" ||
    value === ".html"
  ) {
    throw Object.assign(
      new Error("Dashboard slug must be one .html filename, e.g. pto-team.html"),
      { code: "invalid_input" }
    );
  }
  return value;
}

function agentDataDirectory(agent: AgentConfig): string {
  if (agent.sandbox?.enabled) {
    return getAgentDataDir(resolveHomeDir(), agent.id);
  }
  return path.join(agent.workspaceDir ?? agent.workspace, "data");
}

export function dashboardDirectory(agent: AgentConfig): string {
  return path.join(agentDataDirectory(agent), "dashboards");
}

// Maps a data-db path (relative to the agent's own workspace root) to the
// host path and the root it must stay confined to. Sandboxed agents only see
// their data directory from the host, mounted at data/ in the container.
export function dashboardDatabasePath(
  agent: AgentConfig,
  database: string
): { root: string; path: string } {
  if (!database || path.isAbsolute(database)) {
    throw new Error(
      "Database path must be relative to the workspace root, e.g. data/app.db"
    );
  }
  if (!agent.sandbox?.enabled) {
    const root = agent.workspaceDir ?? agent.workspace;
    return { root, path: path.resolve(root, database) };
  }
  const normalized = path.posix.normalize(database);
  if (!normalized.startsWith("data/") || normalized === "data/") {
    throw new Error(
      "Sandboxed dashboards can only read databases under data/, e.g. data/app.db"
    );
  }
  const root = agentDataDirectory(agent);
  return { root, path: path.resolve(root, normalized.slice("data/".length)) };
}

export function dashboardBaseUrl(config: GatewayConfig): string {
  const configured =
    config.canvas?.baseUrl ?? config.server?.baseUrl ?? config.web?.baseUrl;
  return (configured ?? `http://localhost:${config.ui?.port ?? 3000}`).replace(
    /\/+$/,
    ""
  );
}

export async function openDashboardFile(
  agent: AgentConfig,
  slug: string
): Promise<fs.FileHandle> {
  const directory = dashboardDirectory(agent);
  const candidate = path.join(directory, slug);
  const notFound = `Dashboard not found: data/dashboards/${slug}`;
  let fileHandle: fs.FileHandle | undefined;
  try {
    const directoryStat = await fs.lstat(directory);
    const realDirectory = await fs.realpath(directory);
    if (!directoryStat.isDirectory()) {
      throw new DashboardNotFoundError(notFound);
    }
    fileHandle = await fs.open(
      candidate,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    const [openedStat, candidateStat, directoryStatAfter, realCandidate] =
      await Promise.all([
        fileHandle.stat(),
        fs.lstat(candidate),
        fs.lstat(directory),
        fs.realpath(candidate),
      ]);
    if (
      !openedStat.isFile() ||
      !candidateStat.isFile() ||
      !directoryStatAfter.isDirectory() ||
      openedStat.dev !== candidateStat.dev ||
      openedStat.ino !== candidateStat.ino ||
      !isInsideRoot(realDirectory, realCandidate)
    ) {
      throw new DashboardNotFoundError(notFound);
    }
    return fileHandle;
  } catch (error) {
    await fileHandle?.close();
    if (error instanceof DashboardNotFoundError) throw error;
    throw new DashboardNotFoundError(notFound, {
      cause: error,
    });
  }
}

export async function deleteDashboardFile(
  agent: AgentConfig,
  slug: string
): Promise<boolean> {
  let file: fs.FileHandle;
  try {
    file = await openDashboardFile(agent, slug);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  try {
    const directory = dashboardDirectory(agent);
    const candidate = path.join(directory, slug);
    const [expected, expectedDirectory, realDirectory] = await Promise.all([
      file.stat(),
      fs.lstat(directory),
      fs.realpath(directory),
    ]);
    const [actual, actualDirectory, currentRealDirectory] = await Promise.all([
      fs.lstat(candidate),
      fs.lstat(directory),
      fs.realpath(directory),
    ]);
    if (
      expected.dev !== actual.dev ||
      expected.ino !== actual.ino ||
      expectedDirectory.dev !== actualDirectory.dev ||
      expectedDirectory.ino !== actualDirectory.ino ||
      realDirectory !== currentRealDirectory
    ) {
      throw new DashboardNotFoundError(
        `Dashboard not found: data/dashboards/${slug}`
      );
    }
    await fs.unlink(candidate);
    return true;
  } finally {
    await file.close();
  }
}

async function replaceDashboardFile(
  agent: AgentConfig,
  slug: string,
  content: string
): Promise<void> {
  const directory = dashboardDirectory(agent);
  await fs.mkdir(directory, { recursive: true });
  let readable: fs.FileHandle | undefined;
  try { readable = await openDashboardFile(agent, slug); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Only an absent pathname may be recreated; never replace a rejected symlink.
    await fs.lstat(path.join(directory, slug)).then(() => { throw error; }, (missing: NodeJS.ErrnoException) => {
      if (missing.code !== "ENOENT") throw missing;
    });
  }
  const candidate = path.join(directory, slug);
  const temporary = path.join(
    directory,
    `.${slug}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );
  let writable: fs.FileHandle | undefined;
  try {
    const [expected, expectedDirectory, realDirectory] = await Promise.all([
      readable?.stat(),
      fs.lstat(directory),
      fs.realpath(directory),
    ]);
    if (!expectedDirectory.isDirectory()) {
      throw new DashboardNotFoundError(`Dashboard not found: ${slug}`);
    }
    writable = await fs.open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    await writable.writeFile(content, "utf8");
    await writable.sync();
    await writable.close();
    writable = undefined;

    const [actual, actualDirectory, currentRealDirectory] = await Promise.all([
      fs.lstat(candidate).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return undefined;
      }),
      fs.lstat(directory),
      fs.realpath(directory),
    ]);
    if (
      expected?.dev !== actual?.dev ||
      expected?.ino !== actual?.ino ||
      expectedDirectory.dev !== actualDirectory.dev ||
      expectedDirectory.ino !== actualDirectory.ino ||
      realDirectory !== currentRealDirectory
    ) {
      throw new DashboardNotFoundError(`Dashboard not found: ${slug}`);
    }
    await fs.rename(temporary, candidate);
  } finally {
    await writable?.close();
    await readable?.close();
    await fs.rm(temporary, { force: true });
  }
}

export async function writeDashboardFile(
  agent: AgentConfig,
  slug: string,
  content: string
): Promise<void> {
  const candidate = path.join(dashboardDirectory(agent), slug);
  await serializeByKey(dashboardWrites, candidate, () =>
    replaceDashboardFile(agent, slug, content)
  );
}

// Regular, valid-slug .html files in the agent's dashboard directory, sorted.
// A missing directory yields []; callers handle entries vanishing afterwards.
export async function listDashboardSlugs(agent: AgentConfig): Promise<string[]> {
  try {
    return (await fs.readdir(dashboardDirectory(agent), { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => {
        try {
          normalizeDashboardSlug(name);
          return true;
        } catch {
          return false;
        }
      })
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
