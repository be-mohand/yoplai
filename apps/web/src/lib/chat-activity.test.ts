import { describe, expect, it } from "vitest";
import {
  groupActivityItems,
  lastFiveWords,
  streamingActivityItems,
} from "./chat-activity";

describe("chat activity helpers", () => {
  it("groups only consecutive activity items", () => {
    const items = ["thinking", "tool", "text", "tool", "file"];
    expect(
      groupActivityItems(
        items,
        (item) => item === "thinking" || item === "tool"
      )
    ).toEqual([
      {
        kind: "activity",
        items: ["thinking", "tool"],
        startIndex: 0,
        endIndex: 1,
      },
      { kind: "message", item: "text", startIndex: 2, endIndex: 2 },
      { kind: "activity", items: ["tool"], startIndex: 3, endIndex: 3 },
      { kind: "message", item: "file", startIndex: 4, endIndex: 4 },
    ]);
  });

  it("returns last five normalized words", () => {
    expect(lastFiveWords("one  two\nthree four five six seven ")).toBe(
      "three four five six seven…"
    );
    expect(lastFiveWords("  one two ")).toBe("one two…");
    // Trailing partial token dropped
    expect(lastFiveWords("one two three four five six sev")).toBe(
      "two three four five six…"
    );
    expect(lastFiveWords("partial")).toBe("partial…");
    expect(lastFiveWords("")).toBe("");
  });
});

describe("streamingActivityItems", () => {
  const blocks = [
    { type: "thinking", thinking: "a", timestamp: 10 },
    {
      type: "toolCall",
      name: "t",
      arguments: { x: 1 },
      status: "done",
      timestamp: 20,
      result: "r",
    },
    { type: "thinking", thinking: "b", timestamp: 30 },
  ] as const;
  const segment = groupActivityItems([...blocks], () => true)[0] as Extract<
    ReturnType<typeof groupActivityItems<(typeof blocks)[number]>>[number],
    { kind: "activity" }
  >;

  it("keeps last thinking open and active while streaming", () => {
    const items = streamingActivityItems(blocks, segment, true, true);
    expect(items).toEqual([
      {
        type: "thinking",
        content: "a",
        startedAt: 10,
        endedAt: 20,
        active: false,
      },
      {
        type: "tool",
        name: "t",
        arguments: { x: 1 },
        result: "r",
        status: "done",
        at: 20,
      },
      {
        type: "thinking",
        content: "b",
        startedAt: 30,
        endedAt: undefined,
        active: true,
      },
    ]);
  });

  it("closes last thinking when not streaming and omits tool details in simple mode", () => {
    const items = streamingActivityItems(blocks, segment, false, false);
    expect(items[2]).toMatchObject({ active: false });
    expect(typeof (items[2] as { endedAt: number }).endedAt).toBe("number");
    expect(items[1]).toEqual({
      type: "tool",
      name: "t",
      arguments: { x: 1 },
      at: 20,
    });
  });
});
