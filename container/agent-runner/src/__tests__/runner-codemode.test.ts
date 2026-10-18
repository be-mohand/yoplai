import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type FauxResponseStep,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ContainerInput, ContainerRunnerProtocolEvent } from "@yoplai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abortActiveAgent, runAgent } from "../runner.js";

// Approved seams: Thinh's ALG-506 comment 8fcf9742-a30b-45b2-bd18-5fb24d1cecda.
// runAgent/abortActiveAgent + real Pi/faux + loopback gateway bridge catch real
// script execution, context isolation, nested events and cancellation/recovery;
// they miss browser rendering and persistence owned by the gateway.
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
        timer = setTimeout(() => reject(new Error("Runner did not settle within 5 seconds")), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function script(code: string, id = "codemode-parent") {
  return fauxAssistantMessage(fauxToolCall("codemode", { code }, { id }), {
    stopReason: "toolUse",
  });
}

async function fixture(bridge?: (response: http.ServerResponse) => Promise<unknown>) {
  const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".runner-codemode-"));
  cleanup.push(() => fs.rm(tempDir, { recursive: true, force: true }));
  const workspaceDir = path.join(tempDir, "workspace");
  await fs.mkdir(workspaceDir);
  const requests: Array<Record<string, unknown>> = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    requests.push(JSON.parse(body) as Record<string, unknown>);
    response.setHeader("content-type", "application/json");
    if (request.method !== "POST" || request.url !== "/internal/tools") {
      response.writeHead(404).end();
      return;
    }
    try {
      const result = bridge ? await bridge(response) : { count: 7, sentinel: "ALG506_CHILD_RAW_SENTINEL" };
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(500).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No bridge port");
  const faux = fauxProvider();
  const createRuntime = ModelRuntime.create.bind(ModelRuntime);
  vi.spyOn(ModelRuntime, "create").mockImplementation(async (options) => {
    const runtime = await createRuntime({ ...options, modelsPath: null, refreshOnCreate: false });
    runtime.registerNativeProvider(faux.provider);
    return runtime;
  });
  const input: ContainerInput = {
    agentId: "codemode-agent",
    sessionId: "codemode-session",
    message: "run the script",
    workspaceDir,
    sessionDir: path.join(tempDir, "sessions"),
    ipcDir: path.join(tempDir, "ipc"),
    gatewayUrl: `http://127.0.0.1:${address.port}`,
    agentToken: "fixture-token",
    codemode: true,
    retry: { maxAttempts: 1, baseDelaySeconds: 0 },
    extensionTools: [{
      extensionId: "fixture",
      name: "fixture_count",
      description: "Return the fixture count",
      parameters: { type: "object", properties: {} },
    }],
    sdkConfig: { sdk: "pi", model: { provider: "faux", model: "faux-1" } },
  };
  const events: ContainerRunnerProtocolEvent[] = [];
  const run = (overrides: Partial<ContainerInput> = {}) => bounded(runAgent({ ...input, ...overrides }, (event) => events.push(event)));
  const respond = (responses: FauxResponseStep[]) => faux.setResponses(responses);
  return { input, run, respond, events, requests };
}

describe("Container Pi codemode", () => {
  it.each([undefined, false, true])("declares codemode only when the flag is true (%s)", async (codemode) => {
    const { run, respond } = await fixture();
    let declared: string[] = [];
    respond([(context) => {
      declared = context.messages.flatMap((message) => message.role === "system"
        ? message.toolsAdded?.map((tool) => tool.name) ?? [] : []);
      return fauxAssistantMessage("done");
    }]);
    await expect(run({ codemode })).resolves.toMatchObject({ text: "done" });
    expect(declared.includes("codemode")).toBe(codemode === true);
  });

  it("runs a gateway tool and sends only selected script output to the next model request", async () => {
    const { run, respond, requests } = await fixture();
    let nextContext: TranscriptContext | undefined;
    respond([
      script('const result = JSON.parse(await tools.fixture_count({})); text(result.count); text(typeof models);'),
      (context) => { nextContext = context; return fauxAssistantMessage("done"); },
    ]);
    await expect(run()).resolves.toMatchObject({ text: "done" });
    expect(requests).toEqual([expect.objectContaining({ tool: "fixture_count", args: {}, agentId: "codemode-agent" })]);
    expect(nextContext).toBeDefined();
    const transcript = JSON.stringify(nextContext?.messages);
    expect(transcript).toContain("Script completed");
    expect(transcript).toContain("7");
    expect(transcript).toContain("undefined");
    expect(transcript).not.toContain("ALG506_CHILD_RAW_SENTINEL");
  });

  it("keeps nested tool parent IDs in streamed and returned history", async () => {
    const { run, respond, events } = await fixture();
    respond([script('await tools.fixture_count({}); text("selected");'), fauxAssistantMessage("done")]);
    const output = await run();
    for (const history of [events, output.history]) {
      expect(history).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "tool_call", id: expect.stringMatching(/^codemode-parent\/\d+$/), parentToolCallId: "codemode-parent", name: "fixture_count" }),
        expect.objectContaining({ type: "tool_result", id: expect.stringMatching(/^codemode-parent\/\d+$/), parentToolCallId: "codemode-parent", name: "fixture_count", content: expect.stringContaining("ALG506_CHILD_RAW_SENTINEL"), isError: false }),
      ]));
    }
  });

  it("reports an uncaught child rejection as a codemode error and permits a later script", async () => {
    let shouldFail = true;
    const { run, respond, events } = await fixture(async () => {
      if (shouldFail) throw new Error("fixture child rejected");
      return { count: 7 };
    });
    respond([script('await tools.fixture_count({});'), fauxAssistantMessage("failure handled")]);
    await expect(run()).resolves.toMatchObject({ text: "failure handled" });
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_result", id: "codemode-parent", name: "codemode", isError: true,
      content: expect.stringContaining("fixture child rejected"),
    }));
    shouldFail = false;
    respond([script('text(JSON.parse(await tools.fixture_count({})).count);', "recovery"), fauxAssistantMessage("recovered")]);
    await expect(run({ sessionId: "recovery-session" })).resolves.toMatchObject({ text: "recovered" });
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_result", id: "recovery", name: "codemode", isError: false,
      content: expect.stringContaining("7"),
    }));
  });

  it("aborts an entered child through abortActiveAgent and permits a later script", async () => {
    let entered = () => {};
    let disconnected = () => {};
    const childEntered = new Promise<void>((resolve) => { entered = resolve; });
    const childDisconnected = new Promise<void>((resolve) => { disconnected = resolve; });
    let shouldBlock = true;
    const { run, respond, events } = await fixture(async (response) => {
      if (shouldBlock) {
        entered();
        await new Promise<void>((resolve) => response.once("close", () => {
          disconnected();
          resolve();
        }));
      }
      return { count: 7 };
    });
    respond([script('await tools.fixture_count({}); text("should not finish");')]);
    const activeRun = run();
    try {
      await bounded(childEntered);
      abortActiveAgent();
      await expect(activeRun).resolves.toMatchObject({ aborted: true });
      await bounded(childDisconnected);
    } finally {
      abortActiveAgent();
    }
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_result", id: "codemode-parent", name: "codemode", isError: true,
    }));
    shouldBlock = false;
    respond([script('text(JSON.parse(await tools.fixture_count({})).count);', "after-abort"), fauxAssistantMessage("recovered")]);
    await expect(run({ sessionId: "after-abort-session" })).resolves.toMatchObject({ text: "recovered", aborted: false });
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_result", id: "after-abort", name: "codemode", isError: false,
      content: expect.stringContaining("7"),
    }));
  });
});
