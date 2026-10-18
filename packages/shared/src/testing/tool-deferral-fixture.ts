import type { ExtensionAgentTool } from "../types.js";

// Frozen synthetic workload: 250 tools, including 87 deliberately large MCP schemas.
// No production descriptions, schemas, account data or sessions are used.
export function createToolDeferralFixture() {
  const tools: (ExtensionAgentTool & {
    extensionId: string;
    extensionDescription: string;
  })[] = [];
  const add = (
    extensionId: string,
    name: string,
    description: string,
    large = false
  ) => {
    tools.push({
      extensionId,
      extensionDescription: `${extensionId} fixture capabilities`,
      name,
      description,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: `UNLOADED_SCHEMA_${name} ${"synthetic-schema-field ".repeat(large ? 110 : 35)}`,
          },
        },
      },
      execute: async () => ({ value: `fixture-result:${name}` }),
    });
  };
  for (const name of [
    "adopt",
    "get",
    "checkpoint",
    "pause",
    "resume",
    "complete",
  ])
    add("taskLifecycle", `task.${name}`, `Manage durable tasks: ${name}`);
  for (const name of [
    "list_jobs",
    "create_job",
    "update_job",
    "delete_job",
    "run_job",
    "get_latest_output",
  ])
    add("scheduler", `scheduler.${name}`, `Manage scheduled jobs: ${name}`);
  for (let i = 0; i < 87; i++)
    add(
      "mcp",
      `mcp__claap__recording_${String(i).padStart(3, "0")}`,
      `Retrieve synthetic meeting recording ${i}`,
      true
    );
  for (let i = 0; i < 151; i++)
    add(
      `integration${Math.floor(i / 30)}`,
      `integration${Math.floor(i / 30)}.lookup_${String(i).padStart(3, "0")}`,
      `Search synthetic business records ${i}`
    );
  return {
    tools,
    projectText: "Synthetic project context. ".repeat(900),
    guidance: "Use integrations to answer business questions. ".repeat(90),
  };
}
