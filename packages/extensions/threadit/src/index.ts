import {
  ThreaditExtensionConfigSchema,
  type Extension,
  type ExtensionContext,
} from "@yoplai/shared";
import { resolveThreaditConfig } from "./config.js";
import { ThreaditPoller } from "./poller.js";
import { resolveToolTarget, threaditAgentTools } from "./tools.js";

const pollers = new Map<string, ThreaditPoller>();
let hostContext: ExtensionContext | undefined;
const tools = threaditAgentTools({ getHost: () => hostContext });

function resolveAgent(ctx: ExtensionContext, agentId: string) {
  const live = ctx.getAgent(agentId);
  if (!live || !ctx.isAgentActive(agentId)) return undefined;
  return resolveThreaditConfig(
    ctx.getConfig().extensions?.threadit,
    live.extensions?.threadit
  );
}

/** Start a poller for each enabled agent that has none. Retire the others. */
function reconcilePollers(ctx: ExtensionContext): void {
  for (const [agentId, poller] of [...pollers]) {
    if (resolveAgent(ctx, agentId)?.status !== "ok") {
      poller.retire();
      pollers.delete(agentId);
    }
  }
  for (const agent of ctx.getAgents()) {
    if (pollers.has(agent.id)) continue;
    const resolved = resolveAgent(ctx, agent.id);
    if (!resolved || resolved.status === "skipped") continue;
    if (resolved.status === "invalid") {
      console.error(`[threadit] ${agent.id}: invalid ${resolved.reason}`);
      continue;
    }
    const poller = new ThreaditPoller({
      ctx,
      agentId: agent.id,
      config: resolved.config,
      // Read the live config so a token saved at run time applies at once.
      readConfig: () => {
        const next = resolveAgent(ctx, agent.id);
        return next?.status === "ok" ? next.config : undefined;
      },
    });
    pollers.set(agent.id, poller);
    poller.start();
  }
}

const threaditExtension: Extension = {
  id: "threadit",
  displayName: "Threadit",
  description: "Threadit board agent: answers mentions and replies",
  dependencies: [],
  configSchema: ThreaditExtensionConfigSchema,
  routePrefixes: [],
  validateConfig(raw) {
    if (
      !raw ||
      (typeof raw === "object" &&
        (Object.keys(raw).length === 0 || "_perAgent" in raw))
    ) {
      return { valid: true, errors: [] };
    }
    const result = ThreaditExtensionConfigSchema.safeParse(raw);
    return {
      valid: result.success,
      errors: result.success
        ? []
        : result.error.issues.map((issue) => issue.message),
    };
  },
  registerRoutes() {},
  getAgentTools(agent, context) {
    if (!context) return [];
    return resolveToolTarget(agent, context, hostContext) ? tools : [];
  },
  async start(ctx) {
    hostContext = ctx;
    reconcilePollers(ctx);
  },
  async onConfigReload() {
    if (hostContext) reconcilePollers(hostContext);
  },
  async stop() {
    hostContext = undefined;
    const all = [...pollers.values()];
    pollers.clear();
    await Promise.all(all.map((poller) => poller.stop()));
  },
  capabilities() {
    return ["threadit"];
  },
};

export { threaditExtension };
export { ThreaditPoller } from "./poller.js";
export { resolveThreaditConfig } from "./config.js";
export { threaditAgentTools } from "./tools.js";
