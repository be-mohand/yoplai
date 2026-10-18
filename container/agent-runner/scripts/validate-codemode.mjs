// Host validation, explicitly approved in ALG-506; this does not validate Linux.
// pnpm --filter @yoplai/shared --filter @yoplai/agent-runner build
// node container/agent-runner/scripts/validate-codemode.mjs
// The emitted runAgent interface + real SDK/bridge catches production worker and
// wasm resolution and context isolation; it misses the image and browser display.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { mock } from "node:test";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { abortActiveAgent, runAgent } from "../dist/runner.js";

assert.equal(process.env.YOPLAI_HOME, undefined, "Run with YOPLAI_HOME unset");
assert.ok(!process.env.NODE_OPTIONS?.includes("development"), "Use production package exports");
const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".compiled-codemode-"));
const bridgeCalls = [];
const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/internal/tools") {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  for await (const chunk of request) body += String(chunk);
  bridgeCalls.push(JSON.parse(body));
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ count: 11, sentinel: "ALG506_COMPILED_RAW_CHILD" }));
});
const faux = fauxProvider();
const originalCreate = ModelRuntime.create.bind(ModelRuntime);
const create = mock.method(ModelRuntime, "create", async (options) => {
  const runtime = await originalCreate({ ...options, modelsPath: null, refreshOnCreate: false });
  runtime.registerNativeProvider(faux.provider);
  return runtime;
});
let timer;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const workspaceDir = path.join(tempDir, "workspace");
  await fs.mkdir(workspaceDir);
  let nextRequest;
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("codemode", {
      code: 'const result = JSON.parse(await tools.fixture_count({})); text(`count=${result.count};models=${typeof models}`);',
    }, { id: "compiled-parent" }), { stopReason: "toolUse" }),
    (context) => { nextRequest = JSON.stringify(context.messages); return fauxAssistantMessage("compiled success"); },
  ]);
  const events = [];
  const output = await Promise.race([
    runAgent({
      agentId: "compiled-agent",
      sessionId: "compiled-session",
      message: "Run the fixture script",
      workspaceDir,
      sessionDir: path.join(tempDir, "sessions"),
      ipcDir: path.join(tempDir, "ipc"),
      gatewayUrl: `http://127.0.0.1:${address.port}`,
      agentToken: "compiled-fixture-token",
      codemode: true,
      retry: { maxAttempts: 1, baseDelaySeconds: 0 },
      extensionTools: [{
        extensionId: "fixture",
        name: "fixture_count",
        description: "Return the deterministic count",
        parameters: { type: "object", properties: {} },
      }],
      sdkConfig: { sdk: "pi", model: { provider: "faux", model: "faux-1" } },
    }, (event) => events.push(event)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Compiled runner exceeded 10 seconds")), 10_000);
    }),
  ]);
  assert.equal(output.text, "compiled success");
  assert.equal(bridgeCalls.length, 1);
  assert.equal(bridgeCalls[0].tool, "fixture_count");
  assert.deepEqual(bridgeCalls[0].args, {});
  assert.match(nextRequest, /count=11;models=undefined/);
  assert.ok(!nextRequest.includes("ALG506_COMPILED_RAW_CHILD"));
  assert.ok(events.some((event) => event.type === "tool_result"
    && event.name === "fixture_count" && event.parentToolCallId === "compiled-parent"
    && event.content.includes("ALG506_COMPILED_RAW_CHILD")));
  assert.ok(events.some((event) => event.type === "tool_result"
    && event.id === "compiled-parent" && event.isError === false));
  console.log(JSON.stringify({
    result: "PASS", node: process.version, runner: new URL("../dist/runner.js", import.meta.url).pathname,
    packageExports: "production", bridgeCalls: bridgeCalls.length, childContextIsolated: true,
    image: "not run, owned by Thinh's E2E",
  }));
} finally {
  clearTimeout(timer);
  abortActiveAgent();
  create.mock.restore();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tempDir, { recursive: true, force: true });
}
