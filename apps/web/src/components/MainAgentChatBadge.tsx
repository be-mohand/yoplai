import { Show, createResource, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { fetchMainAgentOptions, fetchMainAgentPreference } from "../api/main-agent";
import type { Agent } from "../api/types";
import { capabilities } from "../lib/capabilities";
import { showToast } from "../lib/toast";
import { MainAgentPicker } from "./MainAgentPicker";

export function MainAgentChatBadge(props: { agentId: string; name: string; onPick: (agentId: string) => void }) {
  const [preference, { mutate: setPreference }] = createResource(() => props.agentId, () => fetchMainAgentPreference().catch(() => null));
  const [agents, setAgents] = createSignal<Agent[] | null>(null);
  const [loading, setLoading] = createSignal(false);
  const openPicker = async () => {
    if (loading()) return;
    setLoading(true);
    try {
      const options = await fetchMainAgentOptions(capabilities.forkedAgents === true);
      if (options.agents.length) setAgents(options.agents);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load agents. Try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return <>
    <Show when={preference()?.accessible && preference()?.mainAgentId === props.agentId}>
      <button type="button" class="main-agent-chat-badge" onClick={() => void openPicker()} disabled={loading()} aria-haspopup="dialog" aria-busy={loading()}>
        Main agent: {props.name}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
      </button>
    </Show>
    <Show when={agents()}>{(choices) => <Portal>
      <MainAgentPicker agents={choices()} initialAgentId={props.agentId} recordDismissal={false} onClose={() => setAgents(null)} onPick={(agent) => {
        setPreference({ mainAgentId: agent.id, accessible: true, pickerDismissedAt: null });
        setAgents(null);
        props.onPick(agent.id);
      }} />
    </Portal>}</Show>
    <style>{`
      .main-agent-chat-badge { display: inline-flex; align-items: center; gap: 6px; min-width: 0; min-height: 36px; padding: 6px 10px; border: 1px solid var(--border-default); border-radius: 8px; color: var(--text-secondary); background: transparent; font: inherit; font-size: 11px; cursor: pointer; text-align: left; }
      .main-agent-chat-badge:hover { color: var(--text-primary); background: var(--bg-raised); }
      .main-agent-chat-badge:focus-visible { outline: 2px solid var(--tone-user); outline-offset: 2px; }
      .main-agent-chat-badge:disabled { cursor: wait; opacity: .5; }
      @media (max-width: 600px) { .main-agent-chat-badge { min-height: 44px; padding: 6px 8px; } }
    `}</style>
  </>;
}
