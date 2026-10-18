import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AgentConfigSchema,
  GatewayConfigSchema,
  type ExtensionAgentTool,
  type HistoryEvent,
  type StreamEvent,
} from "@yoplai/shared";
import {
  fauxAssistantMessage,
  fauxToolCall,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai/providers/faux";
import { ExtensionRuntime } from "../../../extensions/runtime.js";
import { setLoadedConfig } from "../../../config/index.js";
import { piAdapter } from "../adapter.js";

// Approved by Thinh in ALG-506 comment 8fcf9742-a30b-45b2-bd18-5fb24d1cecda:
// piAdapter.run/abort/abortSignal with real Pi + faux catches declarations,
// execution, nested events, model-context isolation and recovery; misses UI/history.
const setup = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const previousHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(process.cwd(), ".pi-codemode-test-"));
  process.env.HOME = home;
  const { fauxProvider } = await import("@earendil-works/pi-ai/providers/faux");
  return {
    home,
    previousHome,
    faux: fauxProvider({ provider: "codemode-test" }),
  };
});

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const sdk =
    await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...sdk,
    ModelRuntime: {
      create: async (
        options: Parameters<typeof sdk.ModelRuntime.create>[0]
      ) => {
        const runtime = await sdk.ModelRuntime.create({
          ...options,
          modelsPath: null,
          refreshOnCreate: false,
        });
        runtime.registerNativeProvider({
          ...setup.faux.provider,
          auth: {
            apiKey: {
              name: "Test",
              resolve: async () => ({ auth: { apiKey: "test-key" } }),
            },
          },
        });
        return runtime;
      },
    },
  };
});

const workspace = path.join(setup.home, "workspace");
let sessionNumber = 0;

beforeEach(async () => {
  await fs.mkdir(workspace, { recursive: true });
  for (const name of ["AGENTS.md", "SOUL.md", "USER.md"]) {
    await fs.writeFile(path.join(workspace, name), "Codemode test workspace.");
  }
});

afterAll(async () => {
  if (setup.previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = setup.previousHome;
  await fs.rm(setup.home, { recursive: true, force: true });
});

function fixture(
  codemode: boolean | undefined,
  execute: ExtensionAgentTool["execute"] = async () => ({
    count: 3,
    sentinel: "RAW_CHILD_SENTINEL_506",
  }),
  extensionId = "fixture"
) {
  const agent = AgentConfigSchema.parse({
    id: "codemode",
    name: "Codemode",
    workspace,
    sdk: "pi",
    codemode,
    model: { provider: "codemode-test", model: setup.faux.getModel().id },
    retryMaxAttempts: 1,
  });
  const config = GatewayConfigSchema.parse({ agents: [agent], extensions: {} });
  setLoadedConfig(config);
  const runtime = new ExtensionRuntime();
  runtime.load([
    {
      id: extensionId,
      displayName: "Fixture",
      description: "Deterministic fixture",
      dependencies: [],
      configSchema: z.object({}),
      routePrefixes: [],
      validateConfig: () => ({ valid: true, errors: [] }),
      registerRoutes: () => undefined,
      start: async () => undefined,
      stop: async () => undefined,
      capabilities: () => [],
      getAgentTools: async () => [
        {
          name: "fixture_count",
          description: "Count deterministic records",
          parameters: { type: "object", properties: {} },
          execute,
        },
      ],
    },
  ]);
  const events: StreamEvent[] = [];
  const history: HistoryEvent[] = [];
  const controller = new AbortController();
  return {
    events,
    history,
    controller,
    params: {
      agentId: agent.id,
      agent,
      sessionId: `codemode-${++sessionNumber}`,
      message: "Run the script",
      workspaceDir: workspace,
      extensionRuntime: runtime,
      onEvent: (event: StreamEvent) => {
        events.push(event);
      },
      onHistoryEvent: (event: HistoryEvent) => {
        history.push(event);
      },
      abortSignal: controller.signal,
    },
  };
}

function script(code: string, id = "script-506") {
  return fauxAssistantMessage(fauxToolCall("codemode", { code }, { id }), {
    stopReason: "toolUse",
  });
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Codemode did not settle within 3 seconds")),
          3_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe("Pi adapter codemode", () => {
  it.each([undefined, false])(
    "does not declare codemode when its agent flag is %s",
    async (enabled) => {
      const run = fixture(enabled);
      let tools: string[] = [];
      setup.faux.setResponses([
        (context) => {
          tools = context.messages.flatMap((message) =>
            message.role === "system"
              ? (message.toolsAdded?.map((tool) => tool.name) ?? [])
              : []
          );
          return fauxAssistantMessage("Codemode disabled");
        },
      ]);
      await expect(piAdapter.run(run.params)).resolves.toMatchObject({
        text: "Codemode disabled",
      });
      expect(tools).not.toContain("fixture_count");
      expect(tools).toContain("tool_search");
      expect(tools).not.toContain("codemode");
    }
  );

  it("runs text-returning extension tools while exposing only script output to the next model request", async () => {
    const run = fixture(true);
    let tools: string[] = [];
    let nextRequest = "";
    const first: FauxResponseFactory = (context) => {
      tools = context.messages.flatMap((message) =>
        message.role === "system"
          ? (message.toolsAdded?.map((tool) => tool.name) ?? [])
          : []
      );
      return script(
        "const result = JSON.parse(await tools.fixture_count({})); text(`count=${result.count};models=${typeof models}`);"
      );
    };
    const next: FauxResponseFactory = (context) => {
      nextRequest = JSON.stringify(context.messages);
      return fauxAssistantMessage("Three records");
    };
    setup.faux.setResponses([first, next]);
    await expect(piAdapter.run(run.params)).resolves.toMatchObject({
      text: "Three records",
    });
    expect(tools).toContain("codemode");
    expect(nextRequest).toContain("count=3;models=undefined");
    expect(nextRequest).not.toContain("RAW_CHILD_SENTINEL_506");
    expect(run.history).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        name: "fixture_count",
        content: expect.stringContaining("RAW_CHILD_SENTINEL_506"),
      })
    );
  });

  it("identifies nested extension calls and results under their codemode parent in stream and history events", async () => {
    const run = fixture(true);
    setup.faux.setResponses([
      script("text(JSON.parse(await tools.fixture_count({})).count);"),
      fauxAssistantMessage("Done"),
    ]);
    await piAdapter.run(run.params);
    for (const events of [run.events, run.history]) {
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "tool_call",
          id: "script-506/1",
          name: "fixture_count",
          parentToolCallId: "script-506",
        })
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "tool_result",
          id: "script-506/1",
          name: "fixture_count",
          parentToolCallId: "script-506",
        })
      );
    }
  });

  it("reports an uncaught child rejection as a codemode error and allows a later script", async () => {
    const run = fixture(true, async () => {
      throw new Error("Fixture unavailable");
    });
    setup.faux.setResponses([
      script("await tools.fixture_count({});"),
      fauxAssistantMessage("Child failed"),
    ]);
    await piAdapter.run(run.params);
    expect(run.events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        id: "script-506",
        name: "codemode",
        isError: true,
        content: expect.stringContaining("Fixture unavailable"),
      })
    );

    const later = fixture(true);
    setup.faux.setResponses([
      script("text(JSON.parse(await tools.fixture_count({})).count);"),
      fauxAssistantMessage("Recovered"),
    ]);
    await expect(piAdapter.run(later.params)).resolves.toMatchObject({
      text: "Recovered",
    });
    expect(later.events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        name: "codemode",
        isError: false,
        content: expect.stringContaining("3"),
      })
    );
  });

  it("aborts an active script and its blocking child through the adapter, then runs another script", async () => {
    const entered = deferred();
    const childAborted = deferred();
    const cleanup = deferred();
    const run = fixture(true, async (_args, context) => {
      entered.resolve();
      const onAbort = () => {
        childAborted.resolve();
      };
      context.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await Promise.race([childAborted.promise, cleanup.promise]);
        if (context.signal?.aborted) throw new Error("Fixture aborted");
        return { count: 0 };
      } finally {
        context.signal?.removeEventListener("abort", onAbort);
      }
    });
    let handle: unknown;
    setup.faux.setResponses([script("await tools.fixture_count({});")]);
    const pending = piAdapter.run({
      ...run.params,
      onSessionHandle: (session) => {
        handle = session;
      },
    });
    const settled = pending.then(
      (result) => ({ result }),
      (error: unknown) => ({ error })
    );
    try {
      await bounded(entered.promise);
      expect(handle).toBeDefined();
      piAdapter.abort?.(handle);
      await bounded(childAborted.promise);
      await bounded(settled);
      expect(run.events).toContainEqual(
        expect.objectContaining({
          type: "tool_result",
          id: "script-506",
          name: "codemode",
          isError: true,
        })
      );
    } finally {
      cleanup.resolve();
      run.controller.abort();
      await bounded(settled);
    }

    const later = fixture(true);
    setup.faux.setResponses([
      script("text(JSON.parse(await tools.fixture_count({})).count);"),
      fauxAssistantMessage("Recovered"),
    ]);
    await expect(bounded(piAdapter.run(later.params))).resolves.toMatchObject({
      text: "Recovered",
    });
    expect(later.events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        name: "codemode",
        isError: false,
      })
    );
  });

  it("rejects a third live worker across sessions and runs again after a worker exits", async () => {
    // Same-module worker-cap seam approved in ALG-506 comment
    // 8fcf9742-a30b-45b2-bd18-5fb24d1cecda: real concurrent SDK sessions,
    // host-controlled tool barriers; catches shared capacity/recovery, misses other processes.
    const firstEntered = deferred();
    const secondEntered = deferred();
    const release = deferred();
    const first = fixture(true, async () => {
      firstEntered.resolve();
      await release.promise;
      return { count: 1 };
    });
    const second = fixture(true, async () => {
      secondEntered.resolve();
      await release.promise;
      return { count: 2 };
    });
    const respond: FauxResponseFactory = (context) =>
      context.messages.some((message) => message.role === "toolResult")
        ? fauxAssistantMessage("Done")
        : script("text(JSON.parse(await tools.fixture_count({})).count);");
    setup.faux.setResponses(Array.from({ length: 30 }, () => respond));
    const holders: Promise<unknown>[] = [];
    try {
      const firstPending = piAdapter.run(first.params);
      holders.push(firstPending);
      void firstPending.catch(() => {});
      await bounded(firstEntered.promise);
      const secondPending = piAdapter.run(second.params);
      holders.push(secondPending);
      void secondPending.catch(() => {});
      await bounded(secondEntered.promise);

      const third = fixture(true);
      await bounded(piAdapter.run(third.params));
      expect(third.events).toContainEqual(
        expect.objectContaining({
          type: "tool_result",
          name: "codemode",
          isError: true,
          content: expect.stringContaining(
            "Codemode worker limit reached (2 workers are still running or shutting down). Retry after they exit."
          ),
        })
      );
    } finally {
      release.resolve();
      await bounded(Promise.allSettled(holders));
      first.controller.abort();
      second.controller.abort();
    }

    let recovered = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const later = fixture(true);
      await bounded(piAdapter.run(later.params));
      const result = later.events.find(
        (event) => event.type === "tool_result" && event.name === "codemode"
      );
      if (!result || result.type !== "tool_result")
        throw new Error("Missing codemode result");
      if (result.isError) {
        expect(result.content).toContain(
          "Codemode worker limit reached (2 workers are still running or shutting down). Retry after they exit."
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      expect(result.content).toContain("3");
      recovered = true;
      break;
    }
    expect(recovered).toBe(true);
  });

  it("executes invisible lifecycle children while keeping them out of stream and display history", async () => {
    const run = fixture(true, async () => ({ count: 7 }), "taskLifecycle");
    setup.faux.setResponses([
      script("text(JSON.parse(await tools.fixture_count({})).count);"),
      fauxAssistantMessage("Seven records"),
    ]);
    await expect(piAdapter.run(run.params)).resolves.toMatchObject({
      text: "Seven records",
    });
    for (const events of [run.events, run.history]) {
      const calls = events.filter(
        (event) => event.type === "tool_call" || event.type === "tool_result"
      );
      expect(calls).toHaveLength(2);
      expect(calls).toContainEqual(
        expect.objectContaining({
          type: "tool_call",
          name: "codemode",
          id: "script-506",
        })
      );
      expect(calls).toContainEqual(
        expect.objectContaining({
          type: "tool_result",
          name: "codemode",
          id: "script-506",
          isError: false,
          content: expect.stringContaining("7"),
        })
      );
      expect(calls).not.toContainEqual(
        expect.objectContaining({ name: "fixture_count" })
      );
    }
  });
});
