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

/** One policy for registration metadata, discoverability and branch activation. */
export function createToolDeferralCatalog(
  catalog: readonly CatalogTool[],
  config?: ToolDeferralConfig
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
  const summary = [...namespaces.entries()]
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
  return {
    tools,
    summary,
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
