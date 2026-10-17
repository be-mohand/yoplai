import { z } from "zod";
import type { ContainerExtensionTool } from "@yoplai/shared";
import { CONFIG_DIR } from "../config/index.js";
import { resolveSessionProject } from "../history/store.js";
import { ChatProjectStore } from "./store.js";

export const projectTools: ContainerExtensionTool[] = [
  {
    extensionId: "gateway", name: "project_references_add",
    description: "Save a useful wiki section as a reference for future chats in this project.",
    parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, path: { type: "string" } }, required: ["title", "description", "path"] },
  },
  {
    extensionId: "gateway", name: "project_notes_append",
    description: "Append a dated note for other agents chatting in this project.",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
];

export async function executeProjectTool(
  name: string,
  args: unknown,
  context: { agentId: string; sessionId: string; userId?: string; projectId?: string }
): Promise<unknown> {
  if (!projectTools.some((tool) => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
  if (!context.projectId) throw new Error("Project memory tools are available only in project chats");
  const currentProjectId = await resolveSessionProject(context.agentId, context.sessionId, context.userId);
  if (currentProjectId !== context.projectId) throw new Error("This chat's project changed; start a new run to update project memory");
  const store = new ChatProjectStore(CONFIG_DIR, context.userId);
  if (!await store.get(context.projectId)) throw new Error("Project not found");
  if (name === "project_references_add") {
    const parsed = z.object({ title: z.string().trim().min(1), description: z.string().trim().min(1), path: z.string().trim().min(1) }).parse(args);
    const reference = await store.addReference(context.projectId, parsed);
    return { id: reference.id, title: reference.title, description: reference.description };
  }
  const parsed = z.object({ text: z.string().trim().min(1) }).parse(args);
  await store.appendNotes(context.projectId, parsed.text);
  return { saved: true };
}
