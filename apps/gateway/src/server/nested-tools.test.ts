import { once } from "node:events";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { afterEach, expect, it, vi } from "vitest";

// Approved by Thinh, ALG-506 comment 8fcf9742: public lifecycle/buffer,
// history HTTP response and WS subscription catch display persistence/reconnect;
// real SDK context isolation and browser rendering are verified at other seams.
let home = "";
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (home) await fs.rm(home, { recursive: true, force: true });
});

it("preserves nested calls through history, the event bus, HTTP and reconnect", async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "yoplai-nested-history-"));
  const workspace = path.join(home, "agents", "test");
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(workspace, "agent.yaml"), "id: test\nname: Test\nmodel:\n  provider: test\n  model: test\n");
  await fs.writeFile(path.join(home, "yoplai.json"), JSON.stringify({ version: 3 }));
  vi.stubEnv("YOPLAI_HOME", home);
  const { HistoryEventSchema, agentEventBus } = await import("@yoplai/shared");
  const { SessionRunLifecycle } = await import("../agents/run-lifecycle.js");
  const { getSessionCurrentTurn } = await import("../agents/sessions.js");
  const { snapshotTurnBuffer, getFullHistory, invalidateResolvedHistoryFile } = await import("../history/store.js");
  const { api } = await import("./api.core.js");
  const { WsBroker } = await import("./ws-broker.js");
  const { getExtensionRuntime } = await import("../extensions/registry.js");
  const lifecycle = new SessionRunLifecycle({ agentId: "test", sessionId: "nested" });
  const observed: unknown[] = [];
  const unsubscribe = agentEventBus.onHistoryEvent((event) => observed.push(event));
  const server = createServer();
  const broker = new WsBroker();
  let socket: WebSocket | undefined;
  lifecycle.beginRun();
  try {
    lifecycle.acceptHistoryEvent({ type: "user", text: "Batch", timestamp: 100 });
    for (const event of [
      { type: "tool_call", id: "batch", name: "codemode", args: { code: "print(3)" }, timestamp: 101 },
      { type: "tool_call", id: "batch/0", parentToolCallId: "batch", name: "count", args: {}, timestamp: 102 },
      { type: "tool_result", id: "batch/0", parentToolCallId: "batch", name: "count", content: "raw child", isError: false, timestamp: 103 },
    ]) lifecycle.acceptHistoryEvent(HistoryEventSchema.parse(event));

    expect(observed).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_call", id: "batch/0", parentToolCallId: "batch" }),
      expect.objectContaining({ type: "tool_result", id: "batch/0", parentToolCallId: "batch" }),
    ]));
    const turn = getSessionCurrentTurn("test", "nested")!;
    expect(snapshotTurnBuffer(turn)).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", content: expect.arrayContaining([
        expect.objectContaining({ type: "toolCall", id: "batch/0", parentToolCallId: "batch" }),
      ]) }),
      expect.objectContaining({ role: "toolResult", toolCallId: "batch/0", parentToolCallId: "batch", content: [{ type: "text", text: "raw child" }] }),
    ]));

    const active = await api.request("/agents/test/history?sessionId=nested&view=full");
    expect(active.status).toBe(200);
    expect(await active.json()).toMatchObject({ activeTurn: { toolCalls: [
      { id: "batch", name: "codemode", status: "running" },
      { id: "batch/0", parentToolCallId: "batch", name: "count", status: "done" },
    ], toolResults: [
      { id: "batch/0", parentToolCallId: "batch", name: "count", content: "raw child", isError: false },
    ] } });

    broker.attach(server, {
      isMultiUserEnabled: () => false,
      validateWebSocketRequest: async () => null,
      canAccessAgent: async () => true,
      getExtensionRuntime,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing loopback port");
    socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await once(socket, "open", { signal: AbortSignal.timeout(3000) });
    const snapshot = once(socket, "message", { signal: AbortSignal.timeout(3000) });
    socket.send(JSON.stringify({ type: "subscribe", agentId: "test", sessionId: "nested", sessionKey: "main" }));
    const [raw] = await snapshot;
    expect(JSON.parse(String(raw))).toMatchObject({ type: "active_turn", toolCalls: [
      { id: "batch" }, { id: "batch/0", parentToolCallId: "batch", status: "done" },
    ], toolResults: [
      { id: "batch/0", parentToolCallId: "batch", name: "count", content: "raw child", isError: false },
    ] });

    lifecycle.acceptHistoryEvent({ type: "tool_result", id: "batch", name: "codemode", content: "3", isError: false, timestamp: 104 });
    await lifecycle.flushTurns();
    invalidateResolvedHistoryFile("test", "nested");
    expect(await getFullHistory("test", "nested")).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", content: expect.arrayContaining([
        expect.objectContaining({ type: "toolCall", id: "batch/0", parentToolCallId: "batch" }),
      ]) }),
      expect.objectContaining({ role: "toolResult", toolCallId: "batch/0", parentToolCallId: "batch", content: [{ type: "text", text: "raw child" }] }),
    ]));
    const reloaded = await api.request("/agents/test/history?sessionId=nested&view=full");
    expect(await reloaded.json()).toMatchObject({ messages: expect.arrayContaining([
      expect.objectContaining({ role: "toolResult", toolCallId: "batch/0", parentToolCallId: "batch" }),
    ]) });
  } finally {
    unsubscribe();
    lifecycle.finishRun();
    socket?.terminate();
    broker.close();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 10000);
