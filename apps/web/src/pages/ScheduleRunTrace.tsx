import { A, useParams } from "@solidjs/router";
import { createMemo, createResource, onMount, Show } from "solid-js";
import type { ScheduleRunTrace as RunTrace } from "@yoplai/shared/types";
import { fetchScheduleRunTrace } from "../api/schedules";
import { BoardChatLog, buildBoardLogs } from "../components/BoardChatRenderer";
import { capabilities, isExtensionEnabled } from "../lib/capabilities";

export function ScheduleRunTrace() {
  const params = useParams<{ agentId: string; jobId: string; runId: string }>();
  return (
    <main class="schedule-run-trace">
      <style>{STYLES}</style>
      <A href={`/agents/${encodeURIComponent(params.agentId)}/schedules/${encodeURIComponent(params.jobId)}/runs`}>Back to run history</A>
      <h1>Run trace</h1>
      <p>Job: {params.jobId}</p>
      <Show when={isExtensionEnabled("scheduler") && capabilities.enableCronMonitoring === true} fallback={<p>Run trace is unavailable.</p>}>
        <LoadTrace agentId={params.agentId} jobId={params.jobId} runId={params.runId} />
      </Show>
    </main>
  );
}

function LoadTrace(props: { agentId: string; jobId: string; runId: string }) {
  const [result, { refetch }] = createResource(
    () => [props.agentId, props.jobId, props.runId] as const,
    async ([agentId, jobId, runId]) => {
      try {
        return { trace: await fetchScheduleRunTrace(agentId, jobId, runId), error: undefined };
      } catch (cause) {
        return { trace: undefined, error: cause instanceof Error ? cause.message : "Failed to load run trace." };
      }
    }
  );
  return (
    <>
      <button type="button" disabled={result.loading} onClick={() => void refetch()}>{result()?.error ? "Retry" : "Refresh"}</button>
      <Show when={result.loading}><p role="status">Loading run trace…</p></Show>
      <Show when={result()?.error}>{(error) => <p role="alert">{error()}</p>}</Show>
      <Show when={result()?.trace} keyed>{(trace) => <TraceContent trace={trace} />}</Show>
    </>
  );
}

function TraceContent(props: { trace: RunTrace }) {
  const logs = createMemo(() => buildBoardLogs(props.trace.messages));
  const anchorIndex = createMemo(() => {
    if (props.trace.run.status === "running") return -1;
    const messages = props.trace.messages;
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]!;
      if (message.role !== "assistant") continue;
      const ownLogs = buildBoardLogs([message]);
      const firstText = ownLogs.findIndex((item) => item.type === "text" && item.role === "assistant");
      if (firstText >= 0) return buildBoardLogs(messages.slice(0, index)).length + firstText;
    }
    return -1;
  });
  let finalOutput: HTMLDivElement | undefined;
  onMount(() => {
    if (anchorIndex() >= 0) finalOutput?.scrollIntoView({ block: "start" });
  });
  return (
    <>
      <p class="schedule-trace-status">{props.trace.run.status} · {props.trace.run.runKind}</p>
      <section class="schedule-trace-prompt"><h2>Prompt</h2><pre>{props.trace.run.prompt || "No agent prompt."}</pre></section>
      <Show when={props.trace.run.gateOutput !== undefined}><section><h2>Gate output</h2><pre>{props.trace.run.gateOutput}</pre></section></Show>
      <Show when={props.trace.run.error}><section role="alert"><h2>Error</h2><pre>{props.trace.run.error}</pre></section></Show>
      <Show when={props.trace.messages.length > 0} fallback={<p>{props.trace.run.runKind === "silent_tick" || props.trace.run.runKind === "script_only" ? "This run did not invoke the agent." : "No conversation history is available for this run."}</p>}>
        <div class="schedule-trace-history">
          <BoardChatLog items={anchorIndex() < 0 ? logs() : logs().slice(0, anchorIndex())} agentName={props.trace.run.agentId} showToolDetails />
          <Show when={anchorIndex() >= 0}>
            <div ref={finalOutput} class="schedule-trace-final" data-final-output>
              <BoardChatLog items={logs().slice(anchorIndex())} agentName={props.trace.run.agentId} showToolDetails />
            </div>
          </Show>
        </div>
      </Show>
    </>
  );
}

const STYLES = `
.schedule-run-trace { flex: 1; min-height: 0; overflow-y: auto; padding: 32px 24px; color: var(--text-primary); }
.schedule-run-trace > * { max-width: 860px; margin-left: auto; margin-right: auto; }
.schedule-run-trace > a { display: block; color: var(--accent, #1a73e8); font-size: 13px; }
.schedule-run-trace h1 { font-size: 22px; margin-top: 20px; }
.schedule-run-trace h2 { font-size: 13px; color: var(--text-secondary); }
.schedule-run-trace pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.schedule-run-trace > button { display: block; padding: 7px 12px; border: 1px solid var(--border-default); border-radius: 7px; background: var(--bg-surface); color: var(--text-primary); cursor: pointer; }
.schedule-run-trace > button:disabled { opacity: .55; cursor: progress; }
.schedule-run-trace [role="alert"] { color: var(--tone-error, #dc2626); }
.schedule-trace-prompt { border: 1px solid var(--border-default); border-radius: 12px; padding: 12px 16px; box-sizing: border-box; }
.schedule-trace-history { margin-top: 24px; }
.schedule-trace-final { margin-top: 24px; min-height: calc(100dvh - 64px); }
`;
