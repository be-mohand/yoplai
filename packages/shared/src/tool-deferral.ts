import type { ToolDeferralConfig, ToolNamespace } from "./types.js";

export function resolveToolDeferralConfig(config?: ToolDeferralConfig) {
  return {
    enabled: config?.enabled ?? true,
    alwaysOnTools: config?.alwaysOnTools ?? [],
    alwaysOnExtensions: config?.alwaysOnExtensions ?? [],
  };
}

type CatalogTool = {
  name: string;
  canonicalName?: string;
  extensionId: string;
  description?: string;
  extensionDescription?: string;
  namespace?: ToolNamespace;
  core?: boolean;
};
type ToolMetadata = {
  exposure: "direct" | "deferred";
  namespace?: { name: string; aliases?: string[]; description?: string };
};

// Pi does not list deferred tools in the codemode description, so a script
// must read a signature before it calls the tool.
const CODEMODE_DEFERRED_RULES = [
  "In a codemode script, call `await describeTool(name)` before the first call to one of these tools. Use the parameter names that it shows.",
  "A tool with an output schema resolves to an object. Do not use JSON.parse on it.",
].join("\n");

/** Structural view of a Pi tool result message; the runtimes pass their own type. */
type ToolResultMessage = {
  role: string;
  toolName?: string;
  isError?: boolean;
  content?: unknown;
};

/** One policy for registration metadata, discoverability and branch activation. */
export function createToolDeferralCatalog(
  catalog: readonly CatalogTool[],
  config?: ToolDeferralConfig,
  options: { codemode?: boolean } = {}
) {
  const policy = resolveToolDeferralConfig(config);
  const tools = new Map<string, ToolMetadata>();
  const namespaces = new Map<
    string,
    {
      label: string;
      displayName?: string;
      description?: string;
      examples: string[];
    }
  >();
  for (const tool of [...catalog].sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const canonicalName = tool.canonicalName ?? tool.name;
    const direct =
      !policy.enabled ||
      tool.core ||
      tool.extensionId === "taskLifecycle" ||
      tool.extensionId === "scheduler" ||
      policy.alwaysOnTools.includes(canonicalName) ||
      policy.alwaysOnExtensions.includes(tool.extensionId);
    if (direct) {
      tools.set(tool.name, { exposure: "direct" });
      continue;
    }
    const mcp = canonicalName.match(/^mcp__(.+?)__/);
    const isMcp = tool.extensionId === "mcp" || Boolean(mcp);
    const server = isMcp ? (tool.namespace?.name ?? mcp?.[1]) : undefined;
    const namespaceName = isMcp && server ? `mcp__${server}` : tool.extensionId;
    const label = server ?? tool.extensionId;
    const description =
      (isMcp
        ? tool.namespace?.description
        : tool.extensionDescription
      )?.trim() || undefined;
    tools.set(tool.name, {
      exposure: "deferred",
      namespace: {
        name: namespaceName,
        ...(isMcp && server ? { aliases: [server] } : {}),
        ...(description ? { description } : {}),
      },
    });
    let group = namespaces.get(namespaceName);
    if (!group) {
      group = { label, description, examples: [] };
      namespaces.set(namespaceName, group);
    }
    group.description ??= description;
    if (isMcp)
      group.displayName ??= tool.namespace?.displayName?.trim() || undefined;
    group.examples.push(
      isMcp && server
        ? canonicalName.replace(`mcp__${server}__`, "")
        : canonicalName
    );
  }
  const namespaceSummary = [...namespaces.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => {
      const detail =
        group.description ??
        `${group.examples.length} tools, e.g. ${group.examples.sort().slice(0, 4).join(", ")}`;
      const label = group.description
        ? (group.displayName ?? group.label)
        : group.label;
      return `${label}: ${detail}`.replace(/\s+/g, " ").slice(0, 200);
    })
    .join("\n");
  const summary =
    namespaceSummary && options.codemode
      ? `${namespaceSummary}\n${CODEMODE_DEFERRED_RULES}`
      : namespaceSummary;
  return {
    tools,
    summary,
    /**
     * Pi answers a call to a deferred tool that is not loaded with a bare
     * "Tool <name> not found" result, before any extension hook runs. Give
     * the model the way to load the tool instead.
     */
    hintUnloadedToolResult<M extends ToolResultMessage>(
      message: M
    ): M | undefined {
      const name = message.toolName;
      if (
        message.role !== "toolResult" ||
        message.isError !== true ||
        !name ||
        tools.get(name)?.exposure !== "deferred" ||
        !Array.isArray(message.content) ||
        message.content.length !== 1
      )
        return undefined;
      const [block] = message.content as { type?: unknown; text?: unknown }[];
      if (block?.type !== "text" || block.text !== `Tool ${name} not found`)
        return undefined;
      return {
        ...message,
        content: [
          {
            type: "text",
            text: `Tool ${name} is not loaded. Call tool_search to load it, then call it again.`,
          },
        ],
      };
    },
    activeToolNames(previousTools: readonly { name: string }[]) {
      const previous = new Set(previousTools.map((tool) => tool.name));
      return [...tools]
        .filter(
          ([name, metadata]) =>
            metadata.exposure === "direct" || previous.has(name)
        )
        .map(([name]) => name);
    },
  };
}
