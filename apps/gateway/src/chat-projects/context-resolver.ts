import fs from "node:fs/promises";
import type { AgentContext } from "@yoplai/shared";
import { CONFIG_DIR } from "../config/index.js";
import { resolveSessionProject } from "../history/store.js";
import { ChatProjectStore, isSafeChatProjectId } from "./store.js";

export const PROJECT_FILES_CONTEXT_BUDGET = 12_000;
export const PROJECT_FILE_INLINE_LIMIT = 4_000;

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
    const filesPath = store.filesDirectory(id);
    await fs.mkdir(filesPath, { recursive: true });
    let files = "";
    const note = "\nAdditional files omitted from context; inspect the project files directory.";
    for (const file of await store.listFiles(id)) {
      const entry = [file.name + " (" + file.id + ", " + file.size + " bytes)",
        file.text && file.text.length <= PROJECT_FILE_INLINE_LIMIT ? file.text : "",
        file.extractionError ?? ""].filter(Boolean).join("\n");
      if (Buffer.byteLength(files + "\n" + entry + note, "utf8") > PROJECT_FILES_CONTEXT_BUDGET) {
        files += note;
        break;
      }
      files += (files ? "\n" : "") + entry;
    }
    return { ...(params.context ?? { kind: "web" }), project: { instructions: project.instructions ?? "", filesPath, files } };
  }
}
