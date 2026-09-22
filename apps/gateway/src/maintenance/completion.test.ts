import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig, GatewayConfig } from "@yoplai/shared";
import {
  completeMaintenance,
  resetMaintenanceCompletionDepsForTests,
} from "./completion.js";

const agent = {
  id: "assistant",
  name: "Assistant",
  workspace: "/tmp/assistant",
  model: { provider: "agent-provider", model: "agent-model" },
} as AgentConfig;

function config(maintenance?: { provider: string; model: string }): GatewayConfig {
  return { agents: [agent], extensions: {}, ...(maintenance ? { maintenance } : {}) } as GatewayConfig;
}

function runtime(model: unknown = { provider: "maintenance-provider", id: "maintenance-model" }) {
  return {
    getModel: vi.fn(() => model),
    completeSimple: vi.fn(async () => ({ content: [{ type: "text", text: "topic" }] })),
  };
}

function params() {
  return {
    agentId: agent.id,
    system: "Return a label",
    prompt: "A conversation",
    maxTokens: 32,
    timeoutMs: 20,
  };
}

afterEach(() => resetMaintenanceCompletionDepsForTests());

describe("completeMaintenance", () => {
  it("uses the configured maintenance model", async () => {
    const modelRuntime = runtime();
    const completeSimple = vi.fn(async () => ({ content: [{ type: "text", text: "  Session topic  " }] }));

    await expect(completeMaintenance(params(), {
      getConfig: () => config({ provider: "maintenance-provider", model: "maintenance-model" }),
      getAgent: () => agent,
      createRuntime: async () => modelRuntime as never,
      completeSimple: completeSimple as never,
    })).resolves.toBe("Session topic");

    expect(modelRuntime.getModel).toHaveBeenCalledWith("maintenance-provider", "maintenance-model");
    expect(completeSimple).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ systemPrompt: "Return a label" }), expect.objectContaining({ temperature: 0, maxRetries: 0 }));
  });

  it("falls back to the session agent model", async () => {
    const modelRuntime = runtime({ provider: "agent-provider", id: "agent-model" });

    await completeMaintenance(params(), {
      getConfig: () => config(),
      getAgent: () => agent,
      createRuntime: async () => modelRuntime as never,
      completeSimple: async () => ({ content: [{ type: "text", text: "topic" }] }) as never,
    });

    expect(modelRuntime.getModel).toHaveBeenCalledWith("agent-provider", "agent-model");
  });

  it("warns once when the model cannot be resolved", async () => {
    const warn = vi.fn();
    const modelRuntime = {
      ...runtime(),
      getModel: vi.fn(() => undefined),
    };
    const deps = {
      getConfig: () => config({ provider: "missing", model: "model" }),
      getAgent: () => agent,
      createRuntime: async () => modelRuntime as never,
      warn,
    };

    await expect(completeMaintenance(params(), deps)).resolves.toBeNull();
    await expect(completeMaintenance(params(), deps)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns null for timeout and provider failures", async () => {
    const warn = vi.fn();
    const modelRuntime = runtime();
    const deps = {
      getConfig: () => config({ provider: "maintenance-provider", model: "maintenance-model" }),
      getAgent: () => agent,
      createRuntime: async () => modelRuntime as never,
      warn,
    };

    await expect(completeMaintenance({ ...params(), timeoutMs: 1 }, {
      ...deps,
      completeSimple: () => new Promise<never>(() => {}),
    })).resolves.toBeNull();
    await expect(completeMaintenance(params(), {
      ...deps,
      completeSimple: async () => ({ stopReason: "error", errorMessage: "provider down", content: [] }) as never,
    })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("times out while the model runtime is still initializing", async () => {
    const warn = vi.fn();

    await expect(completeMaintenance({ ...params(), timeoutMs: 1 }, {
      getConfig: () => config({ provider: "maintenance-provider", model: "maintenance-model" }),
      getAgent: () => agent,
      createRuntime: () => new Promise<never>(() => {}),
      warn,
    })).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      "[maintenance] completion failed",
      expect.objectContaining({ error: expect.stringContaining("timed out") })
    );
  });
});
