import {
  ThreaditExtensionConfigSchema,
  type Extension,
  type ExtensionContext,
} from "@yoplai/shared";
import { resolveThreaditConfig } from "./config.js";
import { ThreaditPoller } from "./poller.js";
import { resolveToolTarget, threaditAgentTools } from "./tools.js";

const pollers: ThreaditPoller[] = [];
let hostContext: ExtensionContext | undefined;
const tools = threaditAgentTools({ getHost: () => hostContext });

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
    const root = ctx.getConfig().extensions?.threadit;
    for (const agent of ctx.getAgents()) {
      if (!ctx.isAgentActive(agent.id)) continue;
      const resolved = resolveThreaditConfig(
        root,
        agent.extensions?.threadit
      );
      if (resolved.status === "skipped") continue;
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
          const live = ctx.getAgent(agent.id);
          if (!live) return undefined;
          const next = resolveThreaditConfig(
            ctx.getConfig().extensions?.threadit,
            live.extensions?.threadit
          );
          return next.status === "ok" ? next.config : undefined;
        },
      });
      pollers.push(poller);
      poller.start();
    }
  },
  async stop() {
    hostContext = undefined;
    await Promise.all(pollers.splice(0).map((poller) => poller.stop()));
  },
  capabilities() {
    return ["threadit"];
  },
};

export { threaditExtension };
export { ThreaditPoller } from "./poller.js";
export { resolveThreaditConfig } from "./config.js";
export { threaditAgentTools } from "./tools.js";
