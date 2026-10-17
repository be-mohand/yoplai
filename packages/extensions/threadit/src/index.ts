import {
  ThreaditExtensionConfigSchema,
  type Extension,
} from "@yoplai/shared";
import { resolveThreaditConfig } from "./config.js";
import { ThreaditPoller } from "./poller.js";

const pollers: ThreaditPoller[] = [];

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
  async start(ctx) {
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
      });
      pollers.push(poller);
      poller.start();
    }
  },
  async stop() {
    await Promise.all(pollers.splice(0).map((poller) => poller.stop()));
  },
  capabilities() {
    return ["threadit"];
  },
};

export { threaditExtension };
export { ThreaditPoller } from "./poller.js";
export { resolveThreaditConfig } from "./config.js";
