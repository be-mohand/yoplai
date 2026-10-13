import fs from "node:fs/promises";
import path from "node:path";
import { getUserHistoryDir } from "@yoplai/extension-multi-user/isolation";
import { CONFIG_DIR } from "../config/index.js";
import { getSessionEntry } from "../sessions/index.js";

export type SessionSummary = {
  agentId: string;
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  firstUserMessage: string;
  title?: string;
  pinned: number | null;
  avatar?: string;
  isMain: boolean;
};

export function parseSessionFileName(
  file: string,
  agentIds: string[]
): { agentId: string; sessionId: string; createdAt: number } | null {
  if (!file.endsWith(".jsonl")) return null;
  const base = file.slice(0, -".jsonl".length);
  const timestampMatch = base.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)_(.+)$/
  );
  const name = timestampMatch ? timestampMatch[5] : base;
  const createdAt = timestampMatch
    ? Date.parse(
        `${timestampMatch[1]}:${timestampMatch[2]}:${timestampMatch[3]}.${timestampMatch[4]}`
      )
    : 0;
  const agentId = [...agentIds]
    .sort((a, b) => b.length - a.length)
    .find((id) => name.startsWith(`${id}-`));
  if (!agentId) return null;
  const sessionId = name.slice(agentId.length + 1);
  if (!sessionId) return null;
  return {
    agentId,
    sessionId,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
  };
}

export function isSafeSessionId(sessionId: string): boolean {
  const hasControlCharacter = [...sessionId].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  return (
    sessionId.length > 0 &&
    sessionId.length <= 200 &&
    !sessionId.includes("/") &&
    !sessionId.includes("\\") &&
    !/(^|[._:-])\.\.($|[._:-])/.test(sessionId) &&
    !hasControlCharacter
  );
}

export function sessionIdIsInteractive(sessionId: string): boolean {
  return (
    isSafeSessionId(sessionId) &&
    !/^(scheduler:|scheduler-|bench-|slack:|slack-|webhook:|webhook-|compact:|compact-|default$)/.test(
      sessionId
    )
  );
}

export function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const obj = block as Record<string, unknown>;
      return obj.type === "text" && typeof obj.text === "string"
        ? obj.text
        : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function summarizeSessionFile(params: {
  filePath: string;
  agentId: string;
  sessionId: string;
  createdAt: number;
  userId?: string;
}): Promise<SessionSummary | null> {
  const [raw, stat] = await Promise.all([
    fs.readFile(params.filePath, "utf8"),
    fs.stat(params.filePath),
  ]);
  let firstUserMessage = "";
  let title: string | undefined;
  let pinned: number | null = null;
  let messageCount = 0;
  let lastActivity = params.createdAt || stat.birthtimeMs;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const timestamp =
        typeof entry.timestamp === "number" ? entry.timestamp : undefined;
      if (entry.type === "meta" && entry.key === "title") {
        title = typeof entry.value === "string" ? entry.value : undefined;
        continue;
      }
      if (entry.type === "meta" && entry.key === "pinned") {
        pinned = typeof entry.value === "number" ? entry.value : null;
        continue;
      }
      if (entry.type !== "history") continue;
      if (entry.role !== "user" && entry.role !== "assistant") continue;
      const text = textFromContent(entry.content);
      if (!text) continue;
      if (timestamp) lastActivity = Math.max(lastActivity, timestamp);
      messageCount += 1;
      if (entry.role === "user" && !firstUserMessage) firstUserMessage = text;
    } catch {
      // Ignore malformed history lines.
    }
  }

  if (messageCount === 0) return null;
  const main = await getSessionEntry(params.agentId, "main", params.userId);
  return {
    agentId: params.agentId,
    sessionId: params.sessionId,
    createdAt: params.createdAt || stat.birthtimeMs,
    lastActivity,
    messageCount,
    pinned,
    firstUserMessage,
    ...(title ? { title } : {}),
    isMain: main?.sessionId === params.sessionId,
  };
}

/** Interactive sessions of one agent for one user, newest activity first. Excludes CLI/subagent run histories. */
export async function listAgentSessionSummaries(
  agentId: string,
  userId?: string
): Promise<SessionSummary[]> {
  const dir = getUserHistoryDir(userId, CONFIG_DIR);
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const items = await Promise.all(
    files.map(async (file) => {
      const parsed = parseSessionFileName(file, [agentId]);
      if (
        !parsed ||
        !sessionIdIsInteractive(parsed.sessionId) ||
        /^(cli|subagent)[:-]/.test(parsed.sessionId)
      ) {
        return null;
      }
      return summarizeSessionFile({
        filePath: path.join(dir, file),
        ...parsed,
        userId,
      });
    })
  );
  return items
    .filter((item): item is SessionSummary => item !== null)
    .sort((a, b) => b.lastActivity - a.lastActivity);
}
