import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";

function unexpectedContextUse(): never {
  throw new Error("Unexpected tool context access");
}

export function createToolContext(): ExtensionToolContext {
  return {
    get ui() {
      return unexpectedContextUse();
    },
    get sessionManager() {
      return unexpectedContextUse();
    },
    get modelRegistry() {
      return unexpectedContextUse();
    },
    mode: "print",
    hasUI: false,
    cwd: "/workspace",
    model: undefined,
    scopedModels: [],
    signal: undefined,
    tools: [],
    executeTool: async () => unexpectedContextUse(),
    isIdle: () => true,
    isProjectTrusted: () => true,
    abort: unexpectedContextUse,
    hasPendingMessages: () => false,
    shutdown: unexpectedContextUse,
    getContextUsage: () => undefined,
    compact: unexpectedContextUse,
    getSystemPrompt: () => "",
  };
}
