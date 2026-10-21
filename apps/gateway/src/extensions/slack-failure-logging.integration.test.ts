import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentConfig, ExtensionContext, GatewayConfig } from "@yoplai/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSlackContext, setSlackContext } from "../../../../packages/extensions/slack/src/context.js";
import { createSlackThreadSessionBindingStore } from "../../../../packages/extensions/slack/src/thread-session-bindings.js";
import type { SlackBot } from "../../../../packages/extensions/slack/src/bot.js";
import { writeTestV3Config } from "../test-utils/v3-config.js";

const transport = vi.hoisted(() => ({
  message: vi.fn(),
  event: vi.fn(),
  command: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  client: {
    auth: { test: vi.fn() },
    chat: { postMessage: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { info: vi.fn(), history: vi.fn() },
    users: { info: vi.fn() },
    reactions: { add: vi.fn(), remove: vi.fn() },
  },
}));

vi.mock("../../../../packages/extensions/slack/node_modules/@slack/bolt", () => ({
  SocketModeReceiver: vi.fn(),
  App: vi.fn(() => transport),
}));

const agent: AgentConfig = {
  id: "logging-agent", name: "Logging", workspace: "~/logging",
  model: { provider: "anthropic", model: "claude" }, queueMode: "queue",
};

describe("Slack terminal failure logs", () => {
  let home: string;
  let bot: SlackBot | null;
  let previousHome: string | undefined;
  let context: ExtensionContext;
  const runAgent = vi.fn();

  beforeAll(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "slack-logging-"));
    previousHome = process.env.YOPLAI_HOME;
    process.env.YOPLAI_HOME = home;
    await writeTestV3Config(home, { agents: [{ id: agent.id }] });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    runAgent.mockReset();
    transport.client.auth.test.mockResolvedValue({ user_id: "Ubot", team_id: "T1" });
    transport.client.chat.postMessage.mockResolvedValue({ ts: "reply" });
    transport.client.conversations.info.mockResolvedValue({ channel: { name: "general" } });
    transport.client.conversations.history.mockResolvedValue({ messages: [] });
    transport.client.users.info.mockResolvedValue({ user: { real_name: "Alice" } });
    const { createExtensionContext } = await import("./context.js");
    context = {
      ...createExtensionContext({} as GatewayConfig),
      runAgent,
    };
    setSlackContext(context);
    const { createSlackBot } = await import("../../../../packages/extensions/slack/src/bot.js");
    bot = createSlackBot([agent], {
      token: "xoxb-test", appToken: "xapp-test",
      channels: { C1: { agent: agent.id, requireMention: false } },
      dm: { enabled: true, agent: agent.id },
    });
    await bot!.start();
  });

  afterEach(async () => {
    await bot?.stop();
    clearSlackContext();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (previousHome === undefined) delete process.env.YOPLAI_HOME;
    else process.env.YOPLAI_HOME = previousHome;
    await fs.rm(home, { recursive: true, force: true });
  });

  it("logs a runner failure once with its bound session and only the first error line", async () => {
    const session = await context.ensureSession(agent.id, "slack:C1:1.0");
    const bindings = createSlackThreadSessionBindingStore(home);
    bindings.setBinding({
      channelId: "C1", threadTs: "1.0", agentId: agent.id,
      sessionId: session.sessionId, owner: null, source: "agent",
    });
    bindings.close();
    runAgent.mockRejectedValue(new Error("Provider unavailable\nprovider diagnostic dump"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const onMessage = transport.message.mock.calls[0][0];

    await onMessage({
      message: { ts: "1.1", thread_ts: "1.0", text: "hello", channel: "C1", user: "U1", channel_type: "channel" },
      client: transport.client,
    });

    expect(errors.mock.calls).toHaveLength(1);
    expect(errors.mock.calls[0]).toHaveLength(1);
    const line = errors.mock.calls[0][0] as string;
    expect(line.startsWith('{"level":"error"')).toBe(true);
    expect(line.split("\n")).toHaveLength(1);
    expect(JSON.parse(line)).toEqual({
      level: "error", msg: "[slack] agent reply failed",
      agentId: "logging-agent", channel: "slack",
      sessionKey: "slack:C1:1.0", sessionId: session.sessionId,
      message: "Provider unavailable",
    });
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.sessionId }));
    expect(transport.client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: "C1", text: "Something went wrong, please try again.", thread_ts: "1.0",
    }));
  });

  it("logs a delivery failure once with the successful run's session id", async () => {
    runAgent.mockResolvedValue({
      payloads: [{ text: "completed answer" }],
      meta: { durationMs: 1, sessionId: "result-session" },
    });
    transport.client.chat.postMessage.mockRejectedValueOnce(new Error("Slack delivery unavailable\ntransport diagnostic dump"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const onMessage = transport.message.mock.calls[0][0];

    await onMessage({
      message: { ts: "2.0", text: "hello", channel: "D1", user: "U1", channel_type: "im" },
      client: transport.client,
    });

    expect(errors.mock.calls).toHaveLength(1);
    expect(errors.mock.calls[0]).toHaveLength(1);
    const line = errors.mock.calls[0][0] as string;
    expect(line.startsWith('{"level":"error"')).toBe(true);
    expect(line.split("\n")).toHaveLength(1);
    expect(JSON.parse(line)).toEqual({
      level: "error", msg: "[slack] agent reply failed",
      agentId: "logging-agent", channel: "slack",
      sessionKey: "main", sessionId: "result-session",
      message: "Slack delivery unavailable",
    });
    expect(transport.client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: "D1", text: "completed answer",
    }));
  });
});
