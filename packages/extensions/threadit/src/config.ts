import {
  ThreaditAgentConfigSchema,
  ThreaditExtensionConfigSchema,
} from "@yoplai/shared";

export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_TURN_TIMEOUT_MINUTES = 60;

export type ResolvedThreaditConfig = {
  baseUrl: string;
  /** Absent until the agent has an account. The poller idles without it. */
  token: string | undefined;
  pollIntervalMs: number;
  turnTimeoutMinutes: number;
  activity: "safe" | "detailed";
};

export type ResolveResult =
  | { status: "ok"; config: ResolvedThreaditConfig }
  | { status: "skipped" }
  | { status: "invalid"; reason: "agent config" | "baseUrl" };

/**
 * Merge root defaults with one agent's `extensions.threadit`.
 * The agent value wins. An agent without config or with `enabled: false` is skipped.
 */
export function resolveThreaditConfig(
  rootRaw: unknown,
  agentRaw: unknown
): ResolveResult {
  if (agentRaw === undefined || agentRaw === null) return { status: "skipped" };
  if (
    typeof agentRaw === "object" &&
    (agentRaw as { enabled?: unknown }).enabled === false
  ) {
    return { status: "skipped" };
  }
  const agent = ThreaditAgentConfigSchema.safeParse(agentRaw);
  if (!agent.success) return { status: "invalid", reason: "agent config" };
  const root = ThreaditExtensionConfigSchema.safeParse(rootRaw ?? {});
  const rootData = root.success ? root.data : {};
  const baseUrl = (agent.data.baseUrl ?? rootData.baseUrl ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!baseUrl) return { status: "invalid", reason: "baseUrl" };
  return {
    status: "ok",
    config: {
      baseUrl,
      token: agent.data.token,
      pollIntervalMs:
        agent.data.pollIntervalMs ??
        rootData.pollIntervalMs ??
        DEFAULT_POLL_INTERVAL_MS,
      turnTimeoutMinutes:
        agent.data.turnTimeoutMinutes ??
        rootData.turnTimeoutMinutes ??
        DEFAULT_TURN_TIMEOUT_MINUTES,
      activity: agent.data.activity ?? rootData.activity ?? "safe",
    },
  };
}
