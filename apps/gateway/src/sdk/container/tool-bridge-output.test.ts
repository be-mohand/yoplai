import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AgentConfigSchema,
  ContainerExtensionToolSchema,
  GatewayConfigSchema,
} from "@yoplai/shared";
import { ExtensionRuntime } from "../../extensions/runtime.js";
import { ContainerToolBridge } from "./tool-bridge.js";

// Approved ALG-507 seam c404cd21: real runtime -> bridge -> wire schema catches
// metadata loss; runner execution and browser rendering are separate seams.
describe("container output schema metadata", () => {
  it("keeps result fields and namespace through the bridge and parsed wire contract", async () => {
    const agent = AgentConfigSchema.parse({
      id: "schema-fixture",
      name: "Fixture",
      workspace: process.cwd(),
      model: { provider: "faux", model: "faux-1" },
    });
    const config = GatewayConfigSchema.parse({ agents: [agent], extensions: {} });
    const runtime = new ExtensionRuntime();
    runtime.load([{
      id: "fixture",
      displayName: "Fixture",
      description: "Schema fixture",
      dependencies: [],
      configSchema: z.object({}),
      routePrefixes: [],
      validateConfig: () => ({ valid: true, errors: [] }),
      registerRoutes: () => undefined,
      start: async () => undefined,
      stop: async () => undefined,
      capabilities: () => [],
      getAgentTools: async () => [{
        name: "fixture_count",
        namespace: { name: "records", description: "Count records" },
        description: "Return nested record counts",
        parameters: { type: "object", properties: {} },
        outputSchema: {
          type: "object",
          properties: { count: { type: "number" } },
          required: ["count"],
        },
        execute: async () => ({ count: 7 }),
      }],
    }]);
    const tools = await new ContainerToolBridge().buildTools({
      agent,
      agentId: agent.id,
      sessionId: "fixture-session",
      message: "Count records",
      workspaceDir: process.cwd(),
      onEvent: () => undefined,
      onHistoryEvent: () => undefined,
      abortSignal: new AbortController().signal,
      extensionRuntime: runtime,
    }, config);
    const tool = ContainerExtensionToolSchema.parse(tools.find((item) => item.name === "fixture_count"));
    expect(tool).toMatchObject({
      namespace: { name: "records", description: "Count records" },
      outputSchema: {
        type: "object",
        properties: { count: { type: "number" } },
        required: ["count"],
      },
    });
    expect(ContainerExtensionToolSchema.parse(tools.find((item) => item.name === "extract_document")))
      .not.toHaveProperty("outputSchema");
  });
});
