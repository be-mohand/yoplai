import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentTools,
  getCurrentSystemMessage,
  type FauxResponseStep,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type {
  ContainerInput,
  ContainerRunnerProtocolEvent,
} from "@yoplai/shared";
import { createToolDeferralFixture } from "@yoplai/shared/testing/tool-deferral-fixture";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abortActiveAgent, runAgent } from "../runner.js";

// Approved seam: ALG-493 comment a70f1a86-1365-4939-b563-0fea11128f5e.
// runAgent/abortActiveAgent + real Pi/faux + loopback gateway exercise outgoing
// declarations, actual bridge execution and persisted host invocations; this
// seam misses live provider serialization and browser rendering.
const cleanup: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  abortActiveAgent();
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Runner did not settle within 10 seconds")),
          10_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fixture() {
  const tempDir = await fs.mkdtemp(
    path.join(process.cwd(), ".runner-deferral-")
  );
  cleanup.push(() => fs.rm(tempDir, { recursive: true, force: true }));
  const workspaceDir = path.join(tempDir, "workspace");
  await fs.mkdir(workspaceDir);
  const registeredCatalogs: Array<Array<{ name: string; exposure?: string }>> =
    [];
  const registryHook = "__alg493RunnerRegistry";
  Object.defineProperty(globalThis, registryHook, {
    configurable: true,
    value: (tools: Array<{ name: string; exposure?: string }>) =>
      registeredCatalogs.push(tools),
  });
  cleanup.push(async () => {
    Reflect.deleteProperty(globalThis, registryHook);
  });
  const extensionsDir = path.join(workspaceDir, ".pi", "extensions");
  await fs.mkdir(extensionsDir, { recursive: true });
  await fs.writeFile(
    path.join(extensionsDir, "registry.js"),
    `export default pi => { pi.on("before_agent_start", () => { globalThis.${registryHook}(pi.getAllTools()); }); };`
  );
  const requests: Array<Record<string, unknown>> = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/internal/tools") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += String(chunk);
    requests.push(JSON.parse(body) as Record<string, unknown>);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ count: 7, source: "synthetic bridge" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No bridge port");
  const faux = fauxProvider();
  const createRuntime = ModelRuntime.create.bind(ModelRuntime);
  vi.spyOn(ModelRuntime, "create").mockImplementation(async (options) => {
    const runtime = await createRuntime({
      ...options,
      modelsPath: null,
      refreshOnCreate: false,
    });
    runtime.registerNativeProvider(faux.provider);
    return runtime;
  });
  const input: ContainerInput = {
    agentId: "deferral-agent",
    sessionId: "deferral-session",
    message: "Find the meeting count",
    workspaceDir,
    sessionDir: path.join(tempDir, "sessions"),
    ipcDir: path.join(tempDir, "ipc"),
    gatewayUrl: `http://127.0.0.1:${address.port}`,
    agentToken: "fixture-token",
    retry: { maxAttempts: 1, baseDelaySeconds: 0 },
    extensionTools: [
      {
        extensionId: "meetings",
        name: "meetings.count",
        description: "Return the unique synthetic meeting count",
        parameters: {
          type: "object",
          properties: {
            marker: { type: "string", description: "UNLOADED_MEETING_SCHEMA" },
          },
        },
      },
    ],
    sdkConfig: { sdk: "pi", model: { provider: "faux", model: "faux-1" } },
  };
  const events: ContainerRunnerProtocolEvent[] = [];
  const run = (overrides: Partial<ContainerInput> = {}) =>
    bounded(
      runAgent({ ...input, ...overrides }, (event) => events.push(event))
    );
  const respond = (responses: FauxResponseStep[]) =>
    faux.setResponses(responses);
  const contexts: TranscriptContext[] = [];
  const capture = (context: TranscriptContext) => {
    contexts.push(context);
    return fauxAssistantMessage("done");
  };
  return {
    input,
    run,
    respond,
    events,
    requests,
    contexts,
    capture,
    registeredCatalogs,
  };
}

function declaredNames(context: TranscriptContext): string[] {
  return getCurrentTools(context.messages)
    .map((tool) => tool.name)
    .sort();
}

describe("Container Pi deferred tools", () => {
  // ALG-507 approved seam c404cd21: real runner/Pi/bridge catches schema-bearing
  // calls before and after activation; live providers and UI are separate seams.
  it("reads structured results before tool_search and after namespace tool activation", async () => {
    const { input, run, respond, contexts, capture, requests, events } = await fixture();
    respond([
      (context) => {
        contexts.push(context);
        return fauxAssistantMessage(fauxToolCall("codemode", {
          code: 'text(`before=${(await tools.meetings_count({})).count}`); text((await describeNamespace("meetings")).name);',
        }, { id: "before-load" }), { stopReason: "toolUse" });
      },
      (context) => {
        contexts.push(context);
        return fauxAssistantMessage(fauxToolCall("tool_search", {
          query: "unique synthetic meeting count", limit: 1,
        }, { id: "load-schema-tool" }), { stopReason: "toolUse" });
      },
      (context) => {
        contexts.push(context);
        return fauxAssistantMessage(fauxToolCall("codemode", {
          code: 'text(`after=${(await tools.meetings_count({})).count}`); text(await describeTool("meetings_count"));',
        }, { id: "after-load" }), { stopReason: "toolUse" });
      },
      capture,
    ]);
    await expect(run({ codemode: true, extensionTools: [{
      ...input.extensionTools![0],
      namespace: { name: "meetings", description: "Find meeting records" },
      outputSchema: { type: "object", properties: { count: { type: "number" }, source: { type: "string" } }, required: ["count"] },
    }] })).resolves.toMatchObject({ text: "done" });
    expect(declaredNames(contexts[0])).not.toContain("meetings_count");
    expect(declaredNames(contexts[1])).not.toContain("meetings_count");
    expect(declaredNames(contexts[2])).toContain("meetings_count");
    expect(declaredNames(contexts[3])).toContain("meetings_count");
    expect(requests).toEqual([
      expect.objectContaining({ tool: "meetings.count", args: {} }),
      expect.objectContaining({ tool: "meetings.count", args: {} }),
    ]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_result", id: "before-load", isError: false, content: expect.stringContaining("before=7"),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_result", id: "after-load", isError: false, content: expect.stringContaining("after=7"),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_result", id: "after-load", content: expect.stringContaining("count: number"),
    }));
  });

  it("declares only core tools and the search loader on the first outgoing request", async () => {
    const { run, respond, contexts, capture, registeredCatalogs } =
      await fixture();
    respond([capture]);
    await expect(run()).resolves.toMatchObject({ text: "done" });
    // Registered includes the deferred tool; declared and outgoing faux tools exclude it.
    expect(registeredCatalogs[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "meetings_count",
          exposure: "deferred",
        }),
        expect.objectContaining({
          name: "tool_search",
          exposure: "model-only",
        }),
      ])
    );
    expect(declaredNames(contexts[0])).toEqual([
      "bash",
      "edit",
      "read",
      "send_file",
      "tool_search",
      "write",
    ]);
    expect(JSON.stringify(contexts[0])).not.toContain(
      "UNLOADED_MEETING_SCHEMA"
    );
  });
  it("searches, loads and executes a registered deferred tool, then restores it on a second host invocation", async () => {
    const { run, respond, contexts, capture, requests, events } =
      await fixture();
    respond([
      (context) => {
        contexts.push(context);
        return fauxAssistantMessage(
          fauxToolCall(
            "tool_search",
            { query: "unique synthetic meeting count", limit: 1 },
            { id: "search-count" }
          ),
          { stopReason: "toolUse" }
        );
      },
      (context) => {
        contexts.push(context);
        return fauxAssistantMessage(
          fauxToolCall("meetings_count", {}, { id: "run-count" }),
          { stopReason: "toolUse" }
        );
      },
      capture,
    ]);
    await expect(run()).resolves.toMatchObject({ text: "done" });
    // Registered and callable tools can be found before they become declared.
    expect(declaredNames(contexts[0])).not.toContain("meetings_count");
    expect(declaredNames(contexts[1])).toContain("meetings_count");
    expect(declaredNames(contexts[2])).toContain("meetings_count");
    const searchResult = contexts[1].messages.find(
      (message) =>
        message.role === "toolResult" && message.toolCallId === "search-count"
    );
    expect(searchResult).toMatchObject({
      details: { loaded: ["meetings_count"] },
    });
    expect(requests).toEqual([
      expect.objectContaining({ tool: "meetings.count", args: {} }),
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool_call", name: "tool_search" }),
        expect.objectContaining({
          type: "tool_result",
          name: "tool_search",
          isError: false,
        }),
        expect.objectContaining({
          type: "tool_result",
          name: "meetings_count",
          content: expect.stringContaining('"count":7'),
        }),
      ])
    );
    respond([capture]);
    await expect(run({ message: "again" })).resolves.toMatchObject({
      text: "done",
    });
    expect(declaredNames(contexts[3])).toContain("meetings_count");
  });

  it("cuts frozen first-request declared schema bytes by at least 80% while deferral off declares all permitted tools", async () => {
    const { input, run, respond, contexts, capture, registeredCatalogs } =
      await fixture();
    const frozen = createToolDeferralFixture();
    const common = {
      extensionTools: frozen.tools,
      extensionSystemPrompts: [frozen.guidance],
      systemFiles: [
        {
          path: path.join(input.workspaceDir, "PROJECT.md"),
          content: frozen.projectText,
        },
      ],
    };
    respond([capture]);
    await run({
      ...common,
      sessionId: "all-direct",
      toolDeferral: {
        enabled: false,
        alwaysOnTools: [],
        alwaysOnExtensions: [],
      },
    });
    respond([capture]);
    await run({ ...common, sessionId: "fresh-deferred" });
    const direct = getCurrentTools(contexts[0].messages);
    const deferred = getCurrentTools(contexts[1].messages);
    expect(registeredCatalogs[0]).toHaveLength(255);
    expect(registeredCatalogs[1]).toHaveLength(256);
    expect(
      registeredCatalogs[1].filter((tool) => tool.exposure === "deferred")
    ).toHaveLength(238);
    expect(direct).toHaveLength(255);
    expect(declaredNames(contexts[1])).toEqual([
      "bash",
      "edit",
      "read",
      "scheduler_create_job",
      "scheduler_delete_job",
      "scheduler_get_latest_output",
      "scheduler_list_jobs",
      "scheduler_run_job",
      "scheduler_update_job",
      "send_file",
      "task_adopt",
      "task_checkpoint",
      "task_complete",
      "task_get",
      "task_pause",
      "task_resume",
      "tool_search",
      "write",
    ]);
    expect(JSON.stringify(deferred)).not.toContain(
      "UNLOADED_SCHEMA_mcp__claap__"
    );
    expect(JSON.stringify(deferred)).not.toContain(
      "UNLOADED_SCHEMA_integration"
    );
    const declaredSchemaBytesBefore = Buffer.byteLength(
      JSON.stringify(direct),
      "utf8"
    );
    const declaredSchemaBytesAfter = Buffer.byteLength(
      JSON.stringify(deferred),
      "utf8"
    );
    expect(
      declaredSchemaBytesAfter / declaredSchemaBytesBefore
    ).toBeLessThanOrEqual(0.2);
    console.log(
      JSON.stringify({
        runtime: "runner",
        declaredSchemaBytesBefore,
        declaredSchemaBytesAfter,
        fullPromptBytesBefore: Buffer.byteLength(
          JSON.stringify(contexts[0]),
          "utf8"
        ),
        fullPromptBytesAfter: Buffer.byteLength(
          JSON.stringify(contexts[1]),
          "utf8"
        ),
      })
    );
  });

  it("keeps owned core tools direct and protects their names while canonical and extension overrides load only authorized tools", async () => {
    const { input, run, respond, contexts, capture } = await fixture();
    const tool = input.extensionTools![0];
    const extensionTools = [
      tool,
      { ...tool, extensionId: "calendar", name: "calendar.events" },
      { ...tool, extensionId: "taskLifecycle", name: "unusual.task" },
      { ...tool, extensionId: "scheduler", name: "unusual.job" },
      { ...tool, extensionId: "gateway", name: "describe_image" },
      { ...tool, extensionId: "gateway", name: "extract_document" },
      ...["read", "send_file", "tool_search", "codemode"].map((name) => ({
        ...tool,
        extensionId: "collision",
        name,
      })),
    ];
    respond([capture]);
    await run({
      extensionTools,
      codemode: true,
      toolDeferral: {
        enabled: true,
        alwaysOnTools: ["meetings.count", "unauthorized.absent"],
        alwaysOnExtensions: ["calendar", "absent"],
      },
    });
    expect(declaredNames(contexts[0])).toEqual([
      "bash",
      "calendar_events",
      "codemode",
      "describe_image",
      "edit",
      "meetings_count",
      "read",
      "send_file",
      "tool_search",
      "unusual_job",
      "unusual_task",
      "write",
    ]);
    const read = getCurrentTools(contexts[0].messages).find(
      (declared) => declared.name === "read"
    );
    expect(read?.description).toContain("Read");
    expect(read?.description).not.toContain("unique synthetic meeting count");
  });

  it("keeps bounded namespace summaries stable across reopening, then replaces and deletes changed catalogs", async () => {
    const { input, run, respond, contexts, capture } = await fixture();
    const base = input.extensionTools![0];
    const described = {
      ...base,
      extensionId: "mcp",
      name: "mcp__meetings__lookup",
      namespace: {
        name: "meetings",
        displayName: "Meeting Library",
        description: "Find recorded meeting notes",
      },
    };
    const fallback = {
      ...base,
      extensionId: "mcp",
      name: "mcp__legacy__not_connected",
    };
    const stock = {
      ...base,
      extensionId: "inventory",
      name: "inventory.lookup",
      extensionDescription: "Find current stock",
    };
    const extensionTools = [described, fallback, stock];
    const summary =
      "inventory: Find current stock\nlegacy: 1 tools, e.g. not_connected\nMeeting Library: Find recorded meeting notes";
    respond([capture]);
    await run({ extensionTools });
    const actualSummary = getCurrentSystemMessage(contexts[0].messages)
      ?.sections?.["deferred-tools"];
    expect(actualSummary).toBe(
      `<deferred-tools>\n${summary}\n</deferred-tools>`
    );
    expect(actualSummary?.split("\n").every((line) => line.length <= 200)).toBe(
      true
    );
    respond([capture]);
    await run({ extensionTools, message: "same catalog" });
    const changes = (context: TranscriptContext) =>
      context.messages.filter(
        (message) =>
          message.role === "system" &&
          Object.hasOwn(message.sections ?? {}, "deferred-tools")
      );
    expect(changes(contexts[1])).toHaveLength(1);
    respond([capture]);
    await run({
      extensionTools: [described, stock],
      message: "legacy disconnected",
    });
    expect(changes(contexts[2])).toHaveLength(2);
    expect(
      getCurrentSystemMessage(contexts[2].messages)?.sections?.[
        "deferred-tools"
      ]
    ).toBe(
      "<deferred-tools>\ninventory: Find current stock\nMeeting Library: Find recorded meeting notes\n</deferred-tools>"
    );
    respond([capture]);
    await run({ extensionTools: [], message: "no integrations" });
    expect(changes(contexts[3])).toHaveLength(3);
    expect(
      getCurrentSystemMessage(contexts[3].messages)?.sections?.[
        "deferred-tools"
      ]
    ).toBeUndefined();
    expect(changes(contexts[3]).at(-1)).toMatchObject({
      sections: { "deferred-tools": null },
    });
  });

  it("drops removed loaded tools on reopen, defers new tools, and handles no-match and disconnected-stub searches", async () => {
    const { input, run, respond, contexts, capture, requests } =
      await fixture();
    respond([
      fauxAssistantMessage(
        fauxToolCall("tool_search", {
          query: "unique synthetic meeting count",
          limit: 1,
        }),
        { stopReason: "toolUse" }
      ),
      capture,
    ]);
    await run();
    expect(declaredNames(contexts[0])).toContain("meetings_count");
    expect(
      contexts[0].messages.filter(
        (message) =>
          message.role === "system" &&
          Object.hasOwn(message.sections ?? {}, "deferred-tools")
      )
    ).toHaveLength(1);
    const base = input.extensionTools![0];
    const extensionTools = [
      {
        ...base,
        extensionId: "mcp",
        name: "mcp__archive__not_connected",
        description: "Disconnected archive credentials",
      },
      {
        ...base,
        extensionId: "new",
        name: "new.available",
        description: "New synthetic catalog capability",
      },
    ];
    respond([
      (context) => {
        contexts.push(context);
        return fauxAssistantMessage(
          fauxToolCall(
            "tool_search",
            { query: "zzzzzz_unmatchable_493" },
            { id: "no-match" }
          ),
          { stopReason: "toolUse" }
        );
      },
      (context) => {
        contexts.push(context);
        return fauxAssistantMessage(
          fauxToolCall(
            "tool_search",
            { query: "not_connected", limit: 1 },
            { id: "load-stub" }
          ),
          { stopReason: "toolUse" }
        );
      },
      (context) => {
        contexts.push(context);
        return fauxAssistantMessage(
          fauxToolCall(
            "mcp__archive__not_connected",
            {},
            { id: "execute-stub" }
          ),
          { stopReason: "toolUse" }
        );
      },
      capture,
    ]);
    await run({ extensionTools, message: "Archive connection changed" });
    expect(declaredNames(contexts[1])).not.toContain("meetings_count");
    expect(declaredNames(contexts[1])).not.toContain("new_available");
    expect(
      contexts[2].messages.find(
        (message) =>
          message.role === "toolResult" && message.toolCallId === "no-match"
      )
    ).toMatchObject({ details: { loaded: [] } });
    expect(
      contexts[3].messages.find(
        (message) =>
          message.role === "toolResult" && message.toolCallId === "load-stub"
      )
    ).toMatchObject({ details: { loaded: ["mcp__archive__not_connected"] } });
    expect(declaredNames(contexts[4])).toContain("mcp__archive__not_connected");
    expect(declaredNames(contexts[4])).not.toContain("new_available");
    expect(requests).toEqual([
      expect.objectContaining({
        tool: "mcp__archive__not_connected",
        args: {},
      }),
    ]);
  });

  it.each([
    { enabled: true, codemode: true },
    { enabled: false, codemode: true },
    { enabled: true, codemode: false },
    { enabled: false, codemode: false },
  ])(
    "preserves callable discovery and execution with deferral=$enabled codemode=$codemode",
    async ({ enabled, codemode }) => {
      const { input, run, respond, contexts, capture, requests, events } =
        await fixture();
      const extensionTools = [
        {
          ...input.extensionTools![0],
          extensionId: "mcp",
          name: "mcp__meetings__lookup",
          namespace: { name: "meetings", description: "Find meeting notes" },
        },
      ];
      const execute = fauxAssistantMessage(
        fauxToolCall("mcp__meetings__lookup", {}, { id: "direct-lookup" }),
        { stopReason: "toolUse" }
      );
      const script = fauxAssistantMessage(
        fauxToolCall(
          "codemode",
          {
            code: `text((await searchTools("unique synthetic meeting count"${enabled ? ', {namespace:"meetings"}' : ""})).map(tool => tool.name)); text(JSON.parse(await tools.mcp__meetings__lookup({})).count);`,
          },
          { id: "lookup-script" }
        ),
        { stopReason: "toolUse" }
      );
      const first = codemode
        ? script
        : enabled
          ? fauxAssistantMessage(
              fauxToolCall("tool_search", {
                query: "unique synthetic meeting count",
                limit: 1,
              }),
              { stopReason: "toolUse" }
            )
          : execute;
      respond([
        (context) => {
          contexts.push(context);
          return first;
        },
        ...(!codemode && enabled ? [execute] : []),
        capture,
      ]);
      await expect(
        run({
          extensionTools,
          codemode,
          toolDeferral: { enabled, alwaysOnTools: [], alwaysOnExtensions: [] },
        })
      ).resolves.toMatchObject({ text: "done" });
      expect(declaredNames(contexts[0]).includes("codemode")).toBe(codemode);
      expect(declaredNames(contexts[0]).includes("tool_search")).toBe(enabled);
      expect(declaredNames(contexts[0]).includes("mcp__meetings__lookup")).toBe(
        !enabled
      );
      expect(requests).toEqual([
        expect.objectContaining({ tool: "mcp__meetings__lookup", args: {} }),
      ]);
      if (codemode) {
        // Script discovery and invocation do not load model declarations.
        expect(
          declaredNames(contexts[1]).includes("mcp__meetings__lookup")
        ).toBe(!enabled);
        const result = contexts[1].messages.find(
          (message) =>
            message.role === "toolResult" &&
            message.toolCallId === "lookup-script"
        );
        expect(result).toMatchObject({
          isError: false,
          content: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining("mcp__meetings__lookup"),
            }),
          ]),
        });
        expect(events).toContainEqual(
          expect.objectContaining({
            type: "tool_call",
            name: "mcp__meetings__lookup",
            parentToolCallId: "lookup-script",
          })
        );
      }
    }
  );
});
