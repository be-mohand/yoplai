export type ActivitySegment<T> =
  | { kind: "activity"; items: T[]; startIndex: number; endIndex: number }
  | { kind: "message"; item: T; startIndex: number; endIndex: number };

/** Groups adjacent activity items without moving them across visible content. */
export function groupActivityItems<T>(
  items: readonly T[],
  isActivity: (item: T) => boolean
): ActivitySegment<T>[] {
  const segments: ActivitySegment<T>[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!isActivity(item)) {
      segments.push({
        kind: "message",
        item,
        startIndex: index,
        endIndex: index,
      });
      continue;
    }
    const previous = segments.at(-1);
    if (previous?.kind === "activity") {
      previous.items.push(item);
      previous.endIndex = index;
    } else {
      segments.push({
        kind: "activity",
        items: [item],
        startIndex: index,
        endIndex: index,
      });
    }
  }
  return segments;
}

/**
 * Ticker excerpt of streaming text: last five complete words + ellipsis.
 * Text not ending in whitespace may end mid-token, so its last word is dropped.
 */
export function lastFiveWords(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1 && !/\s$/.test(text)) words.pop();
  return words.length ? `${words.slice(-5).join(" ")}…` : "";
}

type StreamingThinkingBlock = {
  type: "thinking";
  thinking: string;
  timestamp: number;
};
type StreamingToolBlock<R> = {
  type: "toolCall";
  name: string;
  arguments: unknown;
  status: "running" | "done" | "error";
  timestamp: number;
  result?: R;
};
type StreamingBlockLike = { type: string; timestamp: number };

export type StreamingActivityItem<R> =
  | {
      type: "thinking";
      content: string;
      startedAt: number;
      endedAt: number | undefined;
      active: boolean;
    }
  | {
      type: "tool";
      name: string;
      arguments: unknown;
      result?: R;
      status?: "running" | "done" | "error";
      at: number;
    };

/**
 * Projects an activity segment of streaming blocks to display items.
 * Thinking ends at the next block's timestamp; the last block of a still
 * streaming turn stays open (`endedAt` undefined) and its final thinking item
 * is active. Tool result/status are included only when `toolDetails` is set.
 */
export function streamingActivityItems<B extends StreamingBlockLike, R>(
  blocks: readonly B[],
  segment: Extract<ActivitySegment<B>, { kind: "activity" }>,
  streaming: boolean,
  toolDetails: boolean
): StreamingActivityItem<R>[] {
  const working = streaming && segment.endIndex === blocks.length - 1;
  return segment.items.map((block, itemIndex) => {
    if (block.type === "thinking") {
      return {
        type: "thinking",
        content: (block as unknown as StreamingThinkingBlock).thinking,
        startedAt: block.timestamp,
        endedAt:
          blocks[segment.startIndex + itemIndex + 1]?.timestamp ??
          (working ? undefined : Date.now()),
        active: working && itemIndex === segment.items.length - 1,
      };
    }
    const tool = block as unknown as StreamingToolBlock<R>;
    return toolDetails
      ? {
          type: "tool",
          name: tool.name,
          arguments: tool.arguments,
          result: tool.result,
          status: tool.status,
          at: tool.timestamp,
        }
      : {
          type: "tool",
          name: tool.name,
          arguments: tool.arguments,
          at: tool.timestamp,
        };
  });
}
