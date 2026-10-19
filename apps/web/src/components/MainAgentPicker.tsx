import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import type { Agent } from "../api/types";
import { saveMainAgentPreference } from "../api/main-agent";
import { fetchAgentSessions } from "../api/chat";
import { showToast } from "../lib/toast";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

function Avatar(props: { agent: Agent }) {
  return (
    <Show when={props.agent.avatar} fallback={<span>{props.agent.name.slice(0, 1)}</span>}>
      {(avatar) => /^\p{Emoji}/u.test(avatar()) && avatar().length <= 4
        ? <span>{avatar()}</span>
        : <img src={avatar()} alt="" />}
    </Show>
  );
}

export function MainAgentPicker(props: {
  agents: Agent[];
  initialAgentId?: string;
  recordDismissal?: boolean;
  onPick: (agent: Agent) => void;
  onClose: () => void;
}) {
  const [focusedId, setFocusedId] = createSignal(props.initialAgentId ?? props.agents[0].id);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const [sessions] = createResource(() => !props.initialAgentId, () => fetchAgentSessions().catch(() => ({ items: [] })));
  let interacted = false;
  createEffect(() => {
    if (props.initialAgentId || interacted) return;
    const recent = sessions()?.items
      .filter((session) => props.agents.some((agent) => agent.id === session.agentId))
      .sort((a, b) => b.lastActivity - a.lastActivity)[0];
    if (recent) setFocusedId(recent.agentId);
  });
  createEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    onCleanup(() => { document.body.style.overflow = overflow; });
  });
  const index = createMemo(() => Math.max(0, props.agents.findIndex((agent) => agent.id === focusedId())));
  const focused = () => props.agents[index()];
  const previous = () => props.agents.length > 2 || index() > 0
    ? props.agents[(index() - 1 + props.agents.length) % props.agents.length] : undefined;
  const next = () => props.agents.length > 2 || index() === 0
    ? props.agents[(index() + 1) % props.agents.length] : undefined;
  let confirmButton: HTMLButtonElement | undefined;
  onMount(() => {
    const frame = requestAnimationFrame(() => confirmButton?.focus());
    onCleanup(() => cancelAnimationFrame(frame));
  });
  const focus = (agent: Agent) => { if (!saving()) { interacted = true; setFocusedId(agent.id); } };
  const move = (offset: number) => focus(props.agents[(index() + offset + props.agents.length) % props.agents.length]);

  const dismiss = async () => {
    if (saving()) return;
    setSaving(true);
    setError("");
    try {
      if (props.recordDismissal !== false) {
        await saveMainAgentPreference({ pickerDismissedAt: new Date().toISOString() });
      }
      props.onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your preference. Try again.");
    } finally {
      setSaving(false);
    }
  };
  const choose = async () => {
    if (saving()) return;
    setSaving(true);
    setError("");
    const agent = focused();
    try {
      await saveMainAgentPreference({ mainAgentId: agent.id });
      showToast(`${agent.name} is your main agent`, "success");
      props.onPick(agent);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your main agent. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="main-agent-picker" onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}>
      <Modal title="Pick your main agent" onClose={() => void dismiss()} dismissible={false} size="lg" initialFocus={confirmButton} error={error()}>
        <button type="button" class="main-agent-close" aria-label="Close main agent picker" onClick={() => void dismiss()} disabled={saving()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
        <p class="main-agent-intro">Your everyday starting point. Every agent stays available.</p>
        <div class="main-agent-stage">
          <div class="main-agent-wing">
            <Show when={previous()}>{(agent) => <button type="button" class="main-agent-neighbor" aria-label={`Focus ${agent().name}`} onClick={() => focus(agent())} disabled={saving()}><div class="main-agent-avatar"><Avatar agent={agent()} /></div><span>{agent().name}</span></button>}</Show>
          </div>
          <div class="main-agent-focus" aria-live="polite" aria-atomic="true">
            <div class="main-agent-portrait"><div class="main-agent-avatar"><Avatar agent={focused()} /></div></div>
            <h3>{focused().name}</h3>
            <p>{focused().description ?? focused().role ?? "Ready when you are."}</p>
          </div>
          <div class="main-agent-wing">
            <Show when={next()}>{(agent) => <button type="button" class="main-agent-neighbor" aria-label={`Focus ${agent().name}`} onClick={() => focus(agent())} disabled={saving()}><div class="main-agent-avatar"><Avatar agent={agent()} /></div><span>{agent().name}</span></button>}</Show>
          </div>
        </div>
        <div class="main-agent-navigation">
          <button type="button" aria-label="Previous agent" onClick={() => move(-1)} disabled={saving()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button>
          <span>{index() + 1} of {props.agents.length}</span>
          <button type="button" aria-label="Next agent" onClick={() => move(1)} disabled={saving()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button>
        </div>
        <div class="main-agent-confirm"><Button ref={confirmButton} variant="primary" loading={saving()} loadingLabel="Saving…" disabled={saving()} onClick={() => void choose()}>Make {focused().name} my main agent</Button></div>
        <p class="main-agent-reassurance">Just a preference. You can change it anytime.</p>
        <button type="button" class="main-agent-later" onClick={() => void dismiss()} disabled={saving()}>I will decide later</button>
      </Modal>
      <style>{`
        .main-agent-picker .ui-modal-overlay { background: color-mix(in srgb, var(--bg-base) 78%, transparent); backdrop-filter: blur(8px); padding: 24px; }
        .main-agent-picker .ui-modal { position: relative; width: min(960px, 100%); border: 0; border-radius: 16px; background: var(--bg-surface); box-shadow: 0 32px 96px var(--shadow-md); animation: main-agent-arrive 240ms cubic-bezier(.23,1,.32,1); }
        .main-agent-picker .ui-modal__header { padding: 48px 64px 0; border: 0; text-align: center; }
        .main-agent-picker .ui-modal__header h2 { font-size: clamp(26px, 4vw, 36px); font-weight: 650; letter-spacing: -.03em; line-height: 1.15; text-wrap: balance; }
        .main-agent-picker .ui-modal__body { padding: 12px 48px 32px; gap: 0; text-align: center; }
        .main-agent-intro { color: var(--text-secondary); font-size: 15px; line-height: 1.6; text-wrap: pretty; }
        .main-agent-close { position: absolute; top: 12px; right: 12px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; }
        .main-agent-stage { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 1.5fr) minmax(0, 1fr); align-items: center; gap: 24px; padding-top: 40px; }
        .main-agent-wing { min-width: 0; padding-bottom: 72px; }
        .main-agent-neighbor { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; border: 0; padding: 16px 8px; border-radius: 12px; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; opacity: .65; transition: opacity 160ms, transform 160ms cubic-bezier(.23,1,.32,1); }
        .main-agent-neighbor:hover { opacity: 1; transform: translateY(-4px); }
        .main-agent-neighbor > span { max-width: 100%; overflow-wrap: anywhere; font-size: 14px; }
        .main-agent-avatar { display: grid; place-items: center; width: 80px; height: 80px; font-size: 52px; font-weight: 600; color: var(--tone-user); }
        .main-agent-avatar img { width: 100%; height: 100%; object-fit: contain; }
        .main-agent-portrait { position: relative; display: grid; place-items: center; padding-bottom: 20px; }
        .main-agent-portrait::after { content: ''; position: absolute; bottom: 0; width: 88%; height: 24px; border-radius: 50%; background: var(--bg-raised); }
        .main-agent-portrait .main-agent-avatar { position: relative; z-index: 1; width: 160px; height: 160px; font-size: 104px; }
        .main-agent-focus { min-width: 0; }
        .main-agent-focus h3 { margin: 20px 0 8px; font-size: 28px; font-weight: 650; line-height: 1.2; letter-spacing: -.02em; overflow-wrap: anywhere; }
        .main-agent-focus > p { min-height: 48px; color: var(--text-secondary); font-size: 14px; line-height: 1.6; text-wrap: pretty; }
        .main-agent-navigation { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 20px 0 24px; }
        .main-agent-navigation button { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid var(--border-default); border-radius: 50%; background: transparent; color: var(--text-primary); cursor: pointer; }
        .main-agent-navigation span { min-width: 48px; color: var(--text-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; }
        .main-agent-confirm { display: flex; justify-content: center; }
        .main-agent-confirm .ui-button { justify-content: center; min-height: 48px; padding: 12px 24px; font-size: 15px; border-radius: 8px; }
        .main-agent-reassurance { margin: 16px 0 8px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
        .main-agent-later { min-height: 44px; align-self: center; padding: 8px 12px; border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-size: 13px; text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
        .main-agent-picker button:focus-visible { outline: 2px solid var(--tone-user); outline-offset: 4px; }
        .main-agent-close:hover, .main-agent-navigation button:hover { background: var(--bg-raised); color: var(--text-primary); }
        .main-agent-picker button:active:not(:disabled) { transform: scale(.97); }
        .main-agent-picker button:disabled { cursor: wait; opacity: .5; }
        @keyframes main-agent-arrive { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
        @media (max-width: 600px) {
          .main-agent-picker .ui-modal-overlay { padding: 12px; }
          .main-agent-picker .ui-modal { max-height: calc(100dvh - 24px); }
          .main-agent-picker .ui-modal__header { padding: 56px 24px 0; }
          .main-agent-picker .ui-modal__body { padding: 12px 20px 20px; }
          .main-agent-stage { grid-template-columns: minmax(0, 1fr) minmax(144px, 2.4fr) minmax(0, 1fr); gap: 4px; padding-top: 24px; }
          .main-agent-avatar { width: 44px; height: 44px; font-size: 30px; }
          .main-agent-neighbor { padding: 12px 0; gap: 8px; }
          .main-agent-neighbor > span { font-size: 11px; }
          .main-agent-portrait .main-agent-avatar { width: 120px; height: 120px; font-size: 80px; }
          .main-agent-focus h3 { font-size: 24px; }
          .main-agent-focus > p { font-size: 13px; }
          .main-agent-navigation { margin: 12px 0 20px; }
          .main-agent-confirm .ui-button { width: 100%; padding: 12px; }
        }
        @media (prefers-reduced-motion: reduce) { .main-agent-picker .ui-modal { animation: none; } .main-agent-neighbor { transition: none; } .main-agent-neighbor:hover { transform: none; } }
      `}</style>
    </div>
  );
}
