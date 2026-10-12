import { describe, expect, it } from "vitest";
import type { FullHistoryMessage } from "@yoplai/shared";
import { condense, matchSnippet } from "./condense.js";

const text = (t: string) => [{ type: "text" as const, text: t }];
const user = (t: string, ts = 1_000): FullHistoryMessage => ({
  role: "user", content: text(t), timestamp: ts,
});

describe("condense", () => {
  it("merges tool call and result, drops thinking, hides system", () => {
    const entries: FullHistoryMessage[] = [
      { role: "system", content: text("secret system"), timestamp: 1 },
      user("fix it"),
      {
        role: "assistant",
        timestamp: 2,
        content: [
          { type: "thinking", thinking: "hidden thoughts" },
          { type: "text", text: "looking" },
          { type: "toolCall", id: "c1", name: "read", arguments: { path: "/a/b.ts" } },
          { type: "toolCall", id: "c2", name: "bash", arguments: { command: "ls" } },
        ],
      },
      { role: "toolResult", toolCallId: "c1", toolName: "read", content: text("x".repeat(2000)), isError: false, timestamp: 3 },
      { role: "toolResult", toolCallId: "c2", toolName: "bash", content: text("ENOENT: nope\nmore"), isError: true, timestamp: 4 },
    ];
    const out = condense(entries, { sessionId: "s1" });
    expect(out).not.toContain("hidden thoughts");
    expect(out).not.toContain("secret system");
    expect(out).toContain("#2 asst");
    expect(out).toContain("(ok, 2.0k chars)");
    expect(out).toContain("(ERR: ENOENT: nope, 17 chars)");
    expect(out).not.toContain("#3");
    expect(condense(entries, { sessionId: "s1", role: "system" })).toContain("secret system");
  });

  it("labels custom tools via templates or first string arg", () => {
    const entries: FullHistoryMessage[] = [
      {
        role: "assistant",
        timestamp: 2,
        content: [
          { type: "toolCall", id: "c1", name: "linear_get", arguments: { id: "ALG-1" } },
          { type: "toolCall", id: "c2", name: "web_fetch", arguments: { url: "https://x.dev" } },
        ],
      },
    ];
    const out = condense(entries, {
      sessionId: "s1",
      templates: { web_fetch: "Fetched {url}" },
    });
    expect(out).toContain("→ linear_get ALG-1");
    expect(out).toContain("→ Fetched https://x.dev");
  });

  it("truncates long text, renders files, and expands with full", () => {
    const long = "y".repeat(1000);
    const entries: FullHistoryMessage[] = [
      { role: "user", timestamp: 1, content: [...text(long), { type: "file", fileId: "f", filename: "a.png", mimeType: "image/png", size: 1, direction: "inbound" }] },
    ];
    const out = condense(entries, { sessionId: "s" });
    expect(out).toContain("[+");
    expect(out).toContain("read full=0");
    const full = condense(entries, { sessionId: "s", full: 0 });
    expect(full).toContain(long);
    expect(full).toContain("[image a.png]");
    const huge = condense([user("z".repeat(20000))], { sessionId: "s", full: 0 });
    expect(huge.length).toBeLessThan(8400);
  });

  it("applies the output budget with a more: continuation", () => {
    const entries = Array.from({ length: 40 }, (_, i) => user(`m${i} ${"w".repeat(250)}`));
    const out = condense(entries, { sessionId: "s" });
    expect(out.length).toBeLessThan(4400);
    const next = /more: read session=s from=(\d+)/.exec(out);
    expect(next).not.toBeNull();
    expect(condense(entries, { sessionId: "s", from: Number(next![1]) })).toContain(`#${next![1]} user`);
  });
});

describe("matchSnippet", () => {
  it("finds case-insensitive matches with context", () => {
    expect(matchSnippet("a ".repeat(200) + "NeedLE" + " b".repeat(200), "needle")).toContain("NeedLE");
    expect(matchSnippet("nothing", "zzz")).toBeNull();
  });
});
