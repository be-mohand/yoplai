import type { AgentContext } from "@yoplai/shared";
import { CONFIG_DIR } from "../config/index.js";
import { resolveSessionProject } from "../history/store.js";
import { ChatProjectStore, isSafeChatProjectId } from "./store.js";

export class ProjectContextResolver {
  async resolve(params: {
    agentId: string;
    sessionId: string;
    userId?: string;
    projectId?: string;
    context?: AgentContext;
  }): Promise<AgentContext | undefined> {
    const store = new ChatProjectStore(CONFIG_DIR, params.userId);
    const id = await resolveSessionProject(
      params.agentId, params.sessionId, params.userId, params.projectId,
      async (initialId) => {
        if (!isSafeChatProjectId(initialId) || !await store.get(initialId)) {
          throw new Error("Project not found");
        }
      }
    );
    if (!id || !isSafeChatProjectId(id)) return params.context;
    const project = await store.get(id);
    if (!project) return params.context;
    return { ...(params.context ?? { kind: "web" }), project: { instructions: project.instructions ?? "" } };
  }
}
