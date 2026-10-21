import type { ActiveWorkItem, ExtensionContext } from "@yoplai/shared";

let projectsCtx: ExtensionContext | null = null;

export function setProjectsContext(ctx: ExtensionContext) {
  projectsCtx = ctx;
}

export function getProjectsContext(): ExtensionContext {
  if (!projectsCtx) throw new Error("Projects context not initialized");
  return projectsCtx;
}

/** Report running project subagents so `yoplai gateway restart` can refuse. */
export function reportProjectSubagents(items: ActiveWorkItem[]) {
  projectsCtx?.setActiveWork?.("projects", items);
}

export function clearProjectsContext() {
  projectsCtx = null;
}
