// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { JSX } from "solid-js";
import type { FullHistoryMessage, ScheduleRunTrace as RunTrace } from "@yoplai/shared/types";
import { resetCapabilitiesForTests, setCapabilitiesForTests } from "../lib/capabilities";

const { fetchTraceMock } = vi.hoisted(() => ({ fetchTraceMock: vi.fn() }));
vi.mock("../api/schedules", () => ({ fetchScheduleRunTrace: fetchTraceMock }));
vi.mock("@solidjs/router", () => ({
  A: (props: { href: string; children?: JSX.Element }) => <a href={props.href}>{props.children}</a>,
  useParams: () => ({ agentId: "agent/a", jobId: "job/b", runId: "run/c" }),
}));

import { ScheduleRunTrace } from "./ScheduleRunTrace";

const messages: FullHistoryMessage[] = [
  { role: "system", timestamp: 0, content: [{ type: "text", text: "System instructions" }] },
  { role: "user", timestamp: 1, content: [{ type: "text", text: "Send digest" }] },
  { role: "assistant", timestamp: 2, content: [
    { type: "thinking", thinking: "Check the source first" },
    { type: "text", text: "Checking sources" },
    { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "echo digest", timeout: 12, cwd: "/workspace" } },
  ] },
  { role: "toolResult", timestamp: 3, toolCallId: "tool-1", toolName: "bash", isError: false, content: [{ type: "text", text: "digest result" }] },
  { role: "assistant", timestamp: 4, content: [{ type: "thinking", thinking: "Now summarize" }, { type: "text", text: "Final **digest**" }, { type: "text", text: "Second paragraph" }] },
];
const trace = (patch: Partial<RunTrace> = {}): RunTrace => ({
  run: { id: "run/c", jobId: "job/b", agentId: "agent/a", firedAt: "2026-10-05T08:00:00Z", startedAt: "2026-10-05T08:00:00Z", finishedAt: "2026-10-05T08:01:00Z", status: "ok", runKind: "woke_agent", prompt: "Send digest", storageOwnerId: null },
  messages,
  ...patch,
});
let container: HTMLElement;
let dispose: (() => void) | undefined;
const scrollIntoView = vi.fn();
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  setCapabilitiesForTests({ extensions: { scheduler: true }, enableCronMonitoring: true });
  fetchTraceMock.mockReset().mockResolvedValue(trace());
  scrollIntoView.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  container.remove();
  resetCapabilitiesForTests();
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("ScheduleRunTrace", () => {
  it("renders canonical history and anchors once at the start of the final assistant output", async () => {
    dispose = render(() => <ScheduleRunTrace />, container);
    await settle();
    expect(fetchTraceMock).toHaveBeenCalledWith("agent/a", "job/b", "run/c");
    expect(container.querySelector("a")!.getAttribute("href")).toBe("/agents/agent%2Fa/schedules/job%2Fb/runs");
    expect(container.querySelector(".schedule-trace-prompt")!.textContent).toContain("Send digest");
    expect(container.querySelector(".board-msg-user")!.textContent).toContain("Send digest");
    expect(container.querySelector(".board-msg-system")!.textContent).toContain("SystemSystem instructions");
    expect(container.querySelectorAll(".board-log-thinking")).toHaveLength(2);
    expect(container.querySelector(".board-tool-status")!.textContent).toBe("done");
    const anchor = container.querySelector("[data-final-output]")!;
    expect(anchor.querySelector(".board-msg-assistant strong")!.textContent).toBe("digest");
    expect(anchor.textContent).toContain("Second paragraph");
    expect(anchor.textContent).not.toContain("Checking sources");
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.instances[0]).toBe(anchor);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    container.querySelector<HTMLButtonElement>(".board-tool-header")!.click();
    await settle();
    const tool = container.querySelector(".board-tool-body")!;
    expect(tool.textContent).toContain('"timeout": 12');
    expect(tool.textContent).toContain('"cwd": "/workspace"');
    expect(tool.textContent).toContain("Input");
    expect(tool.textContent).toContain("Output");
    expect(tool.textContent).toContain("digest result");
    container.querySelector<HTMLDetailsElement>(".board-log-thinking")!.open = true;
    await settle();
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it.each(["running", "missing", "no-assistant"])("does not anchor a %s trace", async (kind) => {
    const value = trace();
    if (kind === "running") value.run = { ...value.run, status: "running", finishedAt: undefined };
    if (kind === "missing") value.messages = [];
    if (kind === "no-assistant") value.messages = messages.slice(0, 2);
    fetchTraceMock.mockResolvedValue(value);
    dispose = render(() => <ScheduleRunTrace />, container);
    await settle();
    expect(container.querySelector("[data-final-output]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
    if (kind === "missing") expect(container.textContent).toContain("No conversation history is available");
  });

  it("shows non-agent run outcomes without fabricating conversation", async () => {
    const value = trace({ messages: [] });
    value.run = { ...value.run, runKind: "script_only", status: "error", gateOutput: "<script>gate</script>", error: "Script failed" };
    fetchTraceMock.mockResolvedValue(value);
    dispose = render(() => <ScheduleRunTrace />, container);
    await settle();
    expect(container.textContent).toContain("This run did not invoke the agent.");
    expect(container.textContent).toContain("<script>gate</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Script failed");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("distinguishes failed and pending tool calls", async () => {
    const value = trace();
    value.run = { ...value.run, status: "running", finishedAt: undefined };
    value.messages = [
      { role: "assistant", timestamp: 1, content: [
        { type: "toolCall", id: "failed", name: "read", arguments: { path: "/missing" } },
        { type: "toolCall", id: "pending", name: "bash", arguments: { command: "sleep 1", timeout: 10 } },
      ] },
      { role: "toolResult", timestamp: 2, toolCallId: "failed", toolName: "read", isError: true, content: [{ type: "text", text: "File missing" }] },
    ];
    fetchTraceMock.mockResolvedValue(value);
    dispose = render(() => <ScheduleRunTrace />, container);
    await settle();
    expect(Array.from(container.querySelectorAll(".board-tool-status"), (node) => node.textContent)).toEqual(["error", "running"]);
    expect(container.querySelector(".board-tool-block.error")).not.toBeNull();
    container.querySelector<HTMLButtonElement>(".board-tool-header")!.click();
    expect(container.querySelector(".board-tool-block.error")!.textContent).toContain("File missing");
    const pending = container.querySelectorAll(".board-tool-block")[1]!;
    expect(pending.textContent).toContain('"timeout": 10');
    expect(pending.textContent).not.toContain("Output");
  });

  it.each([undefined, false])("does not load a trace when monitoring is %s", async (enabled) => {
    setCapabilitiesForTests({ extensions: { scheduler: true }, enableCronMonitoring: enabled });
    dispose = render(() => <ScheduleRunTrace />, container);
    await settle();
    expect(fetchTraceMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Run trace is unavailable.");
  });

  it("does not load a trace when scheduler is disabled", async () => {
    setCapabilitiesForTests({ extensions: {}, enableCronMonitoring: true });
    dispose = render(() => <ScheduleRunTrace />, container);
    await settle();
    expect(fetchTraceMock).not.toHaveBeenCalled();
  });

  it("keeps the loading state finite through the API and recovers using Retry", async () => {
    let reject!: (cause: Error) => void;
    fetchTraceMock.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    dispose = render(() => <ScheduleRunTrace />, container);
    expect(container.querySelector('[role="status"]')!.textContent).toContain("Loading");
    expect(container.querySelector("button")!.disabled).toBe(true);
    reject(new Error("Loading run trace timed out. Try again."));
    await settle();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("timed out");
    const retry = container.querySelector("button")!;
    expect(retry.disabled).toBe(false);
    expect(retry.textContent).toBe("Retry");
    retry.click();
    await settle();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("[data-final-output]")).not.toBeNull();
  });
});
