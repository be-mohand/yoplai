import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => vi.useRealTimers());

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
    vi.useFakeTimers();
    vi.setSystemTime(1234);
    const items = streamingActivityItems(blocks, segment, false, false);
    expect(items[2]).toMatchObject({ active: false });
    expect((items[2] as { endedAt: number }).endedAt).toBe(1234);
    expect(items[1]).toEqual({
      type: "tool",
      name: "t",
      arguments: { x: 1 },
      at: 20,
    });
  });

  it("ends thinking at the next block timestamp for a nonzero-offset segment", () => {
    const offsetBlocks = [
      { type: "text", timestamp: 5 },
      { type: "thinking", thinking: "x", timestamp: 40 },
      { type: "file", timestamp: 50 },
    ];
    const offsetSegment = groupActivityItems(
      offsetBlocks,
      (block) => block.type === "thinking"
    )[1] as Extract<
      ReturnType<typeof groupActivityItems<(typeof offsetBlocks)[number]>>[number],
      { kind: "activity" }
    >;
    expect(
      streamingActivityItems(offsetBlocks, offsetSegment, true, false)
    ).toEqual([
      { type: "thinking", content: "x", startedAt: 40, endedAt: 50, active: false },
    ]);
  });
});
