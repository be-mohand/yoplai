import { describe, expect, it } from "vitest";
import { validateToolArguments, type JsonObject, type Tool } from "@earendil-works/pi-ai";
import { slackExtension } from "@yoplai/extension-slack";
import { AgentConfigSchema, GatewayConfigSchema } from "@yoplai/shared";

// ALG-507 seam 1 approved by Thinh (c404cd21): public registration + Pi's
// schema consumer catches success shapes and optional fields; misses Slack HTTP.
describe("Slack result declarations consumed by Pi", () => {
  it("describes compact channel and thread results, including sparse messages and pagination", async () => {
    const agent = AgentConfigSchema.parse({ id: "slack-output", name: "Slack", workspace: "/tmp/slack-output", model: { provider: "test", model: "test" } });
    const config = GatewayConfigSchema.parse({ agents: [agent], extensions: {} });
    const tools = await slackExtension.getAgentTools!(agent, { config });
    const cases: Array<[string, JsonObject[]]> = [
      ["slack.get_channel_history", [
        { ok: true, channel: "C123", messages: [], hasMore: false },
        { ok: true, channel: "C123", messages: [{ ts: "1.0" }, { ts: "2.0", user: "U1", username: "alice", botId: "B1", text: "hello", threadTs: "2.0", replyCount: 2 }], hasMore: true },
      ]],
      ["slack.get_thread_replies", [
        { ok: true, channel: "C123", threadTs: "2.0", messages: [{ ts: "2.0" }], hasMore: false },
        { ok: true, channel: "C123", threadTs: "2.0", messages: [{ ts: "3.0", text: "reply" }], hasMore: true, nextCursor: "page-2" },
      ]],
    ];
    for (const [name, fixtures] of cases) {
      const tool = tools.find(tool => tool.name === name)!;
      expect(tool.outputSchema).toMatchObject({ type: "object", properties: { messages: { type: "array", items: { required: ["ts"] } } } });
      const declaration: Tool = { name, description: "Result fixture", parameters: tool.outputSchema as Tool["parameters"] };
      for (const fixture of fixtures) {
        expect(validateToolArguments(declaration, { type: "toolCall", id: "fixture", name, arguments: fixture })).toEqual(fixture);
      }
      expect(() => validateToolArguments(declaration, { type: "toolCall", id: "invalid", name, arguments: { ...fixtures[0], messages: [{}] } })).toThrow("ts");
    }
    expect(tools.find(tool => tool.name === "slack.list_channels")?.outputSchema).toBeUndefined();
  });
});
