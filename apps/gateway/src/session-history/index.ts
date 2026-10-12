import { z } from "zod";
import type {
  Extension,
  ExtensionAgentToolContext,
  FullHistoryMessage,
} from "@yoplai/shared";
import {
  condense,
  matchSnippet,
  messageToolCalls,
  searchableText,
} from "../history/condense.js";
import { listAgentSessionSummaries } from "../history/sessions.js";
import { getFullHistory } from "../history/store.js";
import { readToolLabels } from "../maintenance/tool-labels.js";

const CURRENT_SESSION_NOTE =
  "[current session — earlier messages compacted from your context; these are the originals]";
const DEFAULT_LIST_LIMIT = 10;
const DEFAULT_SEARCH_LIMIT = 15;

const ArgsSchema = z.object({
  action: z.enum(["list", "search", "read"]),
  query: z.string().min(1).optional(),
  session: z.string().min(1).optional(),
  role: z.enum(["user", "assistant", "system"]).optional(),
  tool: z.string().min(1).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
  from: z.number().int().min(0).optional(),
  to: z.number().int().min(0).optional(),
  around: z.number().int().min(0).optional(),
  n: z.number().int().min(0).max(50).optional(),
  full: z.number().int().min(0).optional(),
});
type Args = z.infer<typeof ArgsSchema>;

function parseDate(value: string | undefined, name: string): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`Invalid ${name} date: ${value}`);
  return time;
}

function day(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 16).replace("T", " ");
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

type Scope = { agentId: string; userId?: string; current?: string };

async function listSessions(args: Args, scope: Scope): Promise<string> {
  const since = parseDate(args.since, "since");
  const until = parseDate(args.until, "until");
  const limit = args.limit ?? DEFAULT_LIST_LIMIT;
  const offset = args.cursor ? Number.parseInt(args.cursor, 10) || 0 : 0;
  const all = (await listAgentSessionSummaries(scope.agentId, scope.userId)).filter(
    (s) =>
      (since === undefined || s.lastActivity >= since) &&
      (until === undefined || s.lastActivity <= until)
  );
  const page = all.slice(offset, offset + limit);
  if (page.length === 0) return "no sessions";
  const lines = page.map((s) => {
    const mark = s.sessionId === scope.current ? "  ★ CURRENT SESSION" : "";
    const first = oneLine(s.title || s.firstUserMessage, 80);
    return `${s.sessionId} · ${day(s.lastActivity)} · ${s.messageCount} msgs · ${first}${mark}`;
  });
  if (offset + limit < all.length) {
    lines.push(`more: list cursor=${offset + limit}`);
  }
  return lines.join("\n");
}

function messageMatches(
  message: FullHistoryMessage,
  query: string,
  args: Args,
  since: number | undefined,
  until: number | undefined
): string | null {
  if (message.role === "toolResult") return null;
  if (args.role ? message.role !== args.role : message.role === "system") {
    return null;
  }
  if (since !== undefined && message.timestamp < since) return null;
  if (until !== undefined && message.timestamp > until) return null;
  if (args.tool && !messageToolCalls(message).some((c) => c.name === args.tool)) {
    return null;
  }
  return matchSnippet(searchableText(message), query);
}

async function searchSessions(args: Args, scope: Scope): Promise<string> {
  if (!args.query) throw new Error("search requires `query`");
  const since = parseDate(args.since, "since");
  const until = parseDate(args.until, "until");
  const limit = args.limit ?? DEFAULT_SEARCH_LIMIT;
  const sessions = (
    await listAgentSessionSummaries(scope.agentId, scope.userId)
  ).filter(
    (s) =>
      (!args.session || s.sessionId === args.session) &&
      (since === undefined || s.lastActivity >= since) &&
      (until === undefined || s.createdAt <= until || s.createdAt === 0)
  );
  const out: string[] = [];
  let hits = 0;
  for (const session of sessions) {
    if (hits >= limit) break;
    const entries = await getFullHistory(
      scope.agentId,
      session.sessionId,
      scope.userId
    );
    const lines: string[] = [];
    for (let i = entries.length - 1; i >= 0 && hits < limit; i--) {
      const snippet = messageMatches(entries[i], args.query, args, since, until);
      if (snippet === null) continue;
      const role = entries[i].role === "assistant" ? "asst" : entries[i].role;
      lines.push(`  #${i} ${role} ${day(entries[i].timestamp)}  ${snippet}`);
      hits++;
    }
    if (lines.length === 0) continue;
    const current = session.sessionId === scope.current;
    out.push(`session ${session.sessionId}${current ? " ★ CURRENT SESSION" : ""}`);
    if (current) out.push(CURRENT_SESSION_NOTE);
    out.push(...lines.reverse());
  }
  if (out.length === 0) return "no matches";
  if (hits >= limit) out.push(`more: results capped at limit=${limit}; narrow the query or raise limit`);
  return out.join("\n");
}

async function readSession(args: Args, scope: Scope): Promise<string> {
  if (!args.session) throw new Error("read requires `session`");
  const sessions = await listAgentSessionSummaries(scope.agentId, scope.userId);
  if (!sessions.some((s) => s.sessionId === args.session)) {
    return `no such session: ${args.session}`;
  }
  const entries = await getFullHistory(scope.agentId, args.session, scope.userId);
  const around = args.around;
  const n = args.n ?? 5;
  const text = condense(entries, {
    sessionId: args.session,
    templates: await readToolLabels(),
    from: around !== undefined ? Math.max(0, around - n) : args.from,
    to: around !== undefined ? around + n : args.to,
    role: args.role,
    full: args.full,
  });
  return args.session === scope.current ? `${CURRENT_SESSION_NOTE}\n${text}` : text;
}

export async function runSessionHistory(
  raw: unknown,
  ctx: Pick<ExtensionAgentToolContext, "agent" | "userId" | "sessionId">
): Promise<string> {
  const args = ArgsSchema.parse(raw);
  const scope: Scope = {
    agentId: ctx.agent.id,
    userId: ctx.userId,
    current: ctx.sessionId,
  };
  if (args.action === "list") return listSessions(args, scope);
  if (args.action === "search") return searchSessions(args, scope);
  return readSession(args, scope);
}

export const sessionHistoryExtension: Extension = {
  id: "sessionHistory",
  displayName: "Session history",
  description: "Search and read the agent's own past conversations.",
  factory: true,
  dependencies: [],
  routePrefixes: [],
  configSchema: z.object({}),
  validateConfig: () => ({ valid: true, errors: [] }),
  registerRoutes: () => {},
  async start() {},
  async stop() {},
  capabilities: () => [],
  getAgentTools(_agent, hook) {
    if (hook?.config.sessionHistory?.enabled === false) return [];
    return [
      {
        name: "session_history",
        description:
          "Look up your own past conversations (read-only). action=list: recent sessions. action=search: case-insensitive substring `query` across sessions (filters: role, tool, since, session, limit). action=read: condensed transcript of `session` (from/to or around+n; role; full=<idx> expands one message). Output is compact text with #idx anchors; follow `more:` lines to continue.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list", "search", "read"] },
            query: { type: "string", description: "search: substring to find" },
            session: { type: "string", description: "read/search: session id" },
            role: { type: "string", enum: ["user", "assistant", "system"] },
            tool: { type: "string", description: "search: only messages calling this tool" },
            since: { type: "string", description: "ISO date lower bound" },
            until: { type: "string", description: "list/search: ISO date upper bound" },
            limit: { type: "number", description: "list default 10, search default 15" },
            cursor: { type: "string", description: "list: continuation cursor" },
            from: { type: "number", description: "read: first #idx" },
            to: { type: "number", description: "read: last #idx" },
            around: { type: "number", description: "read: centre #idx" },
            n: { type: "number", description: "read: messages each side of around (default 5)" },
            full: { type: "number", description: "read: expand message #idx untruncated" },
          },
          required: ["action"],
        },
        execute: (args: unknown, ctx: ExtensionAgentToolContext) =>
          runSessionHistory(args, ctx),
      },
    ];
  },
};
