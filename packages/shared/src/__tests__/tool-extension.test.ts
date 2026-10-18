import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineToolExtension } from "../tool-extension.js";
import { GatewayConfigSchema, resolveAgentConfigRoute } from "../types.js";

describe("tool extensions", () => {
  // ALG-507 seam 1 approved by Thinh (c404cd21): public registration catches
  // conversion/discovery/legacy compatibility; runtime execution is tested in Pi.
  it("declares nested result fields for agent and discovery callers without references", async () => {
    const row = z.object({ id: z.number() });
    const extension = defineToolExtension({
      id: "sample", displayName: "Sample", description: "Sample",
      configSchema: z.object({}), requiredSecrets: [],
      createTools: () => [
        { name: "list", description: "List", parameters: z.object({}), outputSchema: z.object({ first: row, second: row }), execute: async () => ({ first: { id: 7 }, second: { id: 9 } }) },
        { name: "legacy", description: "Legacy", parameters: z.object({}), execute: async () => "legacy" },
      ],
    });
    const config = GatewayConfigSchema.parse({ agents: [{ id: "main", name: "Main", workspace: "~/main", model: { provider: "test", model: "test" }, extensions: { sample: {} } }], extensions: { sample: {} } });
    const agentTools = await extension.getAgentTools?.(config.agents[0]!, { config });
    const discovery = await extension.getDiscoveryTools?.();
    for (const tools of [agentTools, discovery]) {
      expect(tools?.[0]?.outputSchema).toEqual({
        $schema: "http://json-schema.org/draft-07/schema#", type: "object",
        properties: {
          first: { type: "object", properties: { id: { type: "number" } }, required: ["id"], additionalProperties: false },
          second: { type: "object", properties: { id: { type: "number" } }, required: ["id"], additionalProperties: false },
        }, required: ["first", "second"], additionalProperties: false,
      });
      expect(tools?.[1]?.outputSchema).toBeUndefined();
    }
    await expect(agentTools?.[1]?.execute({}, { agent: config.agents[0]!, config })).resolves.toBe("legacy");
  });

  it("merges root and agent config, resolves env refs, and prefixes tools", async () => {
    process.env.YOPLAI_TEST_TOKEN = "secret";
    let receivedConfig: unknown;
    const extension = defineToolExtension({
      id: "sample",
      displayName: "Sample",
      description: "Sample tool extension",
      systemPrompt: "Use Sample when needed.",
      configSchema: z.object({
        token: z.string(),
        region: z.string(),
      }),
      agentConfigSchema: z.object({
        region: z.string(),
      }),
      requiredSecrets: ["token"],
      advancedConfigFields: ["region"],
      createTools(config) {
        receivedConfig = config;
        return [
          {
            name: "ping",
            description: "Ping",
            namespace: { name: "sample", displayName: "Sample service", description: "Check service availability" },
            parameters: z.object({}),
            execute: async () => "pong",
          },
        ];
      },
    });

    const config = GatewayConfigSchema.parse({
      version: 2,
      agents: [
        {
          id: "main",
          name: "Main",
          workspace: "~/agents/main",
          model: { provider: "anthropic", model: "claude" },
          extensions: {
            sample: { enabled: true, region: "eu" },
          },
        },
      ],
      extensions: {
        sample: { token: "$env:YOPLAI_TEST_TOKEN", region: "us" },
      },
    });

    const agent = config.agents[0]!;
    const tools = await extension.getAgentTools?.(agent, { config });
    const prompt = await extension.getSystemPromptContributions?.(agent, {
      config,
    });

    expect(receivedConfig).toEqual({
      global: { token: "secret", region: "us" },
      root: { token: "secret", region: "us" },
      agent: { region: "eu" },
      merged: { token: "secret", region: "eu" },
    });
    expect(tools?.[0]?.name).toBe("sample_ping");
    expect(tools?.[0]?.parameters).toMatchObject({ type: "object" });
    expect(tools?.[0]?.namespace).toEqual({ name: "sample", displayName: "Sample service", description: "Check service availability" });
    const discoveryTools = await extension.getDiscoveryTools?.();
    expect(discoveryTools?.[0]?.namespace).toEqual({ name: "sample", displayName: "Sample service", description: "Check service availability" });
    expect(extension.advancedConfigFields).toEqual(["region"]);
    expect(prompt).toEqual(["Use Sample when needed."]);

    delete process.env.YOPLAI_TEST_TOKEN;
  });

  it("does not enable tools from root config alone", async () => {
    const extension = defineToolExtension({
      id: "sample",
      displayName: "Sample",
      description: "Sample tool extension",
      configSchema: z.object({}),
      requiredSecrets: [],
      createTools: () => [
        {
          name: "ping",
          description: "Ping",
          parameters: z.object({}),
          execute: async () => "pong",
        },
      ],
    });
    const config = GatewayConfigSchema.parse({
      version: 2,
      agents: [
        {
          id: "main",
          name: "Main",
          workspace: "~/agents/main",
          model: { provider: "anthropic", model: "claude" },
        },
      ],
      extensions: { sample: {} },
    });

    await expect(
      extension.getAgentTools?.(config.agents[0]!, { config })
    ).resolves.toEqual([]);
  });

  it("forwards extension tool context env to tool implementations", async () => {
    const execute = vi.fn(async (_params, context) => context.env?.SLACK_TOKEN);
    const extension = defineToolExtension({
      id: "sample",
      displayName: "Sample",
      description: "Sample tool extension",
      configSchema: z.object({}),
      requiredSecrets: [],
      createTools: () => [
        {
          name: "ping",
          description: "Ping",
          parameters: z.object({}),
          execute,
        },
      ],
    });
    const config = GatewayConfigSchema.parse({
      version: 2,
      agents: [
        {
          id: "main",
          name: "Main",
          workspace: "~/agents/main",
          model: { provider: "anthropic", model: "claude" },
          extensions: { sample: {} },
        },
      ],
      extensions: { sample: {} },
    });
    const agent = config.agents[0]!;
    const tools = await extension.getAgentTools?.(agent, { config });

    await expect(
      tools?.[0]?.execute({}, { agent, config, env: { SLACK_TOKEN: "agent" } })
    ).resolves.toBe("agent");
    expect(execute).toHaveBeenCalledWith(
      {},
      { agent, config, env: { SLACK_TOKEN: "agent" } }
    );
  });

  it("validates required secrets per enabled agent", () => {
    const extension = defineToolExtension({
      id: "sample",
      displayName: "Sample",
      description: "Sample tool extension",
      configSchema: z.object({ apiKey: z.string().optional() }),
      requiredSecrets: ["apiKey"],
      createTools: () => [],
    });
    const config = GatewayConfigSchema.parse({
      version: 2,
      agents: [
        {
          id: "main",
          name: "Main",
          workspace: "~/agents/main",
          model: { provider: "anthropic", model: "claude" },
          extensions: { sample: {} },
        },
      ],
      extensions: { sample: {} },
    });

    expect(extension.validateAgentConfigs?.(config)).toEqual({
      valid: false,
      errors: [
        'Extension "sample" for agent "main" config invalid: Extension "sample" for agent "main" missing required secret "apiKey"',
      ],
    });
  });

  it("validates one agent using the supplied env map", () => {
    const extension = defineToolExtension({
      id: "sample", displayName: "Sample", description: "Sample", configSchema: z.object({ token: z.string(), count: z.number() }), requiredSecrets: ["token"], createTools: () => [],
    });
    const config = GatewayConfigSchema.parse({ version: 2, agents: [{ id: "main", name: "Main", workspace: "~/agents/main", model: { provider: "anthropic", model: "claude" }, extensions: { sample: { enabled: true, token: "$env:TOKEN", count: "bad" } } }], extensions: { sample: {} } });
    expect(extension.validateAgentConfig?.(config.agents[0]!, config, {})).toEqual({ valid: false, errors: ["TOKEN"] });
    expect(extension.validateAgentConfig?.(config.agents[0]!, config, { TOKEN: "secret" })).toEqual({ valid: false, errors: ["count"] });
    expect(extension.validateAgentConfig?.({ ...config.agents[0]!, extensions: { sample: { enabled: true, token: "$env:TOKEN", count: 1 } } }, config, { TOKEN: "secret" })).toEqual({ valid: true, errors: [] });
  });

  it("passes through a self-registered agent-keyed configRoute", () => {
    const extension = defineToolExtension({
      id: "mcp",
      displayName: "MCP",
      description: "File-based MCP config",
      configSchema: z.object({}),
      requiredSecrets: [],
      configRoute: { path: "/agents/:agentId/extensions/mcp" },
      createTools: () => [],
    });
    expect(extension.configRoute).toEqual({
      path: "/agents/:agentId/extensions/mcp",
    });
  });

  it("omits configRoute when the extension does not self-register one", () => {
    const extension = defineToolExtension({
      id: "plain",
      displayName: "Plain",
      description: "No bespoke config",
      configSchema: z.object({}),
      requiredSecrets: [],
      createTools: () => [],
    });
    expect(extension.configRoute).toBeUndefined();
  });
});

describe("resolveAgentConfigRoute", () => {
  it("substitutes the concrete agent id for :agentId", () => {
    expect(
      resolveAgentConfigRoute(
        { path: "/agents/:agentId/extensions/mcp" },
        "sales"
      )
    ).toBe("/agents/sales/extensions/mcp");
  });

  it("url-encodes the agent id", () => {
    expect(
      resolveAgentConfigRoute({ path: "/agents/:agentId/cfg" }, "a b/c")
    ).toBe("/agents/a%20b%2Fc/cfg");
  });

  it("returns undefined when no route is declared", () => {
    expect(resolveAgentConfigRoute(undefined, "sales")).toBeUndefined();
  });

  it("throws when the template is missing the :agentId token", () => {
    expect(() =>
      resolveAgentConfigRoute({ path: "/agents/static/cfg" }, "sales")
    ).toThrow(/:agentId/);
  });
});
