import { describe, expect, it } from "vitest";
import {
  buildSlackContext,
  buildMattermostContext,
  buildTelegramContext,
  buildUserContext,
  renderAgentContext,
} from "./context-rendering.js";

describe("renderAgentContext web user context", () => {
  it("renders the web user context block", () => {
    expect(renderAgentContext(buildUserContext({ name: "Thinh" }))).toBe(
      [
        "[USER CONTEXT]",
        "context: web UI",
        "name: Thinh",
        "[END USER CONTEXT]",
      ].join("\n")
    );
  });

  it("falls back when the user name is missing", () => {
    expect(renderAgentContext(buildUserContext({ name: undefined }))).toContain(
      "name: unknown"
    );
  });
});

describe("renderAgentContext telegram context", () => {
  it("renders a telegram DM context block", () => {
    const rendered = renderAgentContext(
      buildTelegramContext({
        metadata: {
          channel: "telegram",
          place: "direct message / alice",
          conversationType: "direct_message",
          sender: "alice",
        },
      })
    );
    expect(rendered).toContain("channel: telegram");
    expect(rendered).toContain("conversation_type: direct_message");
    expect(rendered).toContain("sender: alice");
    expect(rendered).toContain("recent_history:");
  });

  it("renders history entries when provided", () => {
    const rendered = renderAgentContext(
      buildTelegramContext({
        metadata: {
          channel: "telegram",
          place: "direct message / alice",
          conversationType: "direct_message",
          sender: "alice",
        },
        history: [{ author: "alice", content: "hi", timestamp: 0 }],
      })
    );
    expect(rendered).toContain("alice: hi");
  });

  it("returns empty string without metadata", () => {
    expect(renderAgentContext(buildTelegramContext({}))).toBe("");
  });
});

describe("renderAgentContext mattermost context", () => {
  it("renders a thread reply with its channel, starter and reply note", () => {
    const rendered = renderAgentContext(
      buildMattermostContext({
        metadata: {
          channel: "mattermost",
          place: "#Support / thread root1",
          conversationType: "thread_reply",
          sender: "@alice",
          conversationId: "root1",
        },
        channelName: "Support",
        channelTopic: "Customer questions",
        threadStarter: { author: "@bob", content: "Invoice missing", timestamp: 0 },
      })
    );
    expect(rendered).toContain("channel: mattermost");
    expect(rendered).toContain("conversation_type: thread_reply");
    expect(rendered).toContain("conversation_id: root1");
    expect(rendered).toContain("channel_name: #Support");
    expect(rendered).toContain("channel_topic: Customer questions");
    expect(rendered).toContain("@bob at 1970-01-01T00:00:00.000Z - Invoice missing");
    expect(rendered).toContain("Do not call mattermost.send_message to reply here");
    expect(rendered).not.toContain("[FORMATTING]");
  });

  it("returns empty string without metadata", () => {
    expect(renderAgentContext(buildMattermostContext({}))).toBe("");
  });
});

describe("renderAgentContext slack sender identity", () => {
  const metadata = { channel: "slack" as const, place: "#ops", conversationType: "channel_message" as const, sender: "Thinh" };

  it("renders the conversation id when provided", () => {
    const rendered = renderAgentContext(
      buildSlackContext({
        metadata: { ...metadata, conversationType: "group_direct_message", conversationId: "G1" },
      })
    );
    expect(rendered).toContain("conversation_type: group_direct_message");
    expect(rendered).toContain("conversation_id: G1");
  });

  it("tells the model to pair an unpaired sender", () => {
    const rendered = renderAgentContext(buildSlackContext({ metadata, unpairedSender: true }));
    expect(rendered).toContain("sender_identity: unpaired");
    expect(rendered).toContain("slack.pair");
  });

  it("omits the note for paired senders", () => {
    expect(renderAgentContext(buildSlackContext({ metadata }))).not.toContain("sender_identity");
  });
});

describe("renderAgentContext slack reply delivery", () => {
  const metadata = { channel: "slack" as const, place: "#ops", conversationType: "channel_message" as const, sender: "Thinh" };

  it("tells the model its reply is delivered automatically", () => {
    const rendered = renderAgentContext(buildSlackContext({ metadata }));
    expect(rendered).toContain("[REPLY]");
    expect(rendered).toContain("Do not call slack.send_message to reply here");
  });
});
