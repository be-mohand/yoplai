import { Show, createResource, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { fetchMainAgentOptions, fetchMainAgentPreference } from "../api/main-agent";
import type { Agent } from "../api/types";
import { capabilities } from "../lib/capabilities";
import { showToast } from "../lib/toast";
import { MainAgentPicker } from "./MainAgentPicker";

export function MainAgentStarButton(props: { agentId: string; name: string; onPick: (agentId: string) => void }) {
  const [preference, { mutate: setPreference }] = createResource(() => props.agentId, () => fetchMainAgentPreference().catch(() => null));
  const isMain = () => preference()?.accessible === true && preference()?.mainAgentId === props.agentId;
  const [agents, setAgents] = createSignal<Agent[] | null>(null);
  const [loading, setLoading] = createSignal(false);
  const openPicker = async () => {
    if (loading()) return;
    setLoading(true);
    try {
      const options = await fetchMainAgentOptions(capabilities.forkedAgents === true);
      setPreference(options.preference);
      if (options.agents.length) setAgents(options.agents);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load agents. Try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return <>
    <button
      type="button"
      class="main-agent-star-btn"
      classList={{ "is-main": isMain() }}
      onClick={() => void openPicker()}
      disabled={loading()}
      aria-haspopup="dialog"
      aria-busy={loading()}
      aria-pressed={isMain()}
      aria-label={isMain() ? `${props.name} is your main agent. Change main agent` : "Choose main agent"}
      title={isMain() ? "Main agent" : "Choose main agent"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={isMain() ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
    </button>
    <Show when={agents()}>{(choices) => <Portal>
      <MainAgentPicker agents={choices()} initialAgentId={props.agentId} recordDismissal={false} onClose={() => setAgents(null)} onPick={(agent) => {
        setPreference({ mainAgentId: agent.id, accessible: true, pickerDismissedAt: null });
        setAgents(null);
        props.onPick(agent.id);
      }} />
    </Portal>}</Show>
    <style>{`
      .main-agent-star-btn { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; padding: 0; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--surface-2) 70%, transparent); background: color-mix(in srgb, var(--surface-1) 78%, transparent); color: var(--text-secondary); cursor: pointer; transition: background 0.16s ease, color 0.16s ease; }
      .main-agent-star-btn:hover { background: var(--surface-3); color: var(--text-primary); }
      .main-agent-star-btn.is-main { color: var(--tone-user); }
      .main-agent-star-btn:focus-visible { outline: 2px solid var(--tone-user); outline-offset: 2px; }
      .main-agent-star-btn:disabled { cursor: wait; opacity: .5; }
      @media (max-width: 600px) { .main-agent-star-btn { width: 44px; height: 44px; } }
    `}</style>
  </>;
}
