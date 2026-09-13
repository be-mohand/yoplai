import type { AgentConfig, GatewayConfig } from "@yoplai/shared";
import { describe, expect, it } from "vitest";
import type { ExtensionRuntime, LoadedExtensionAgentTool } from "./runtime.js";
import { getExtensionAgentTools } from "./tools.js";

function runtimeWith(tools: LoadedExtensionAgentTool[]): ExtensionRuntime {
  return { getTools: async () => tools } as unknown as ExtensionRuntime;
}

describe("getExtensionAgentTools", () => {
  it("strips regex pattern keywords but keeps properties named pattern", async () => {
    const execute = async () => "ok";
    const tools = await getExtensionAgentTools(
      { id: "cira" } as AgentConfig,
      {} as GatewayConfig,
      runtimeWith([
        {
          extensionId: "mcp",
          name: "mcp__claap__get_user",
          description: "Get a user",
          parameters: {
            type: "object",
            properties: {
              email: {
                type: "string",
                format: "email",
                pattern: "^(?!\\.)(?!.*\\.\\.)[^@]+@[^@]+$",
              },
              pattern: { type: "string", description: "Glob to match" },
              tags: {
                type: "array",
                items: { type: "string", pattern: "^(?=x).*$" },
              },
            },
            required: ["email", "pattern"],
          },
          execute,
        },
      ])
    );

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ extensionId: "mcp", name: "mcp__claap__get_user", execute });
    expect(tools[0].parameters).toEqual({
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        pattern: { type: "string", description: "Glob to match" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["email", "pattern"],
    });
  });
});
