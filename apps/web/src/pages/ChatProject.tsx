import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { fetchAgents, fetchAgentSessions, startNewChat } from "../api";
import { deleteChatProject, fetchChatProject, renameChatProject, updateChatProjectInstructions } from "../api/chat-projects";

export function ChatProject() {
  const params = useParams();
  const navigate = useNavigate();
  const [project, { refetch }] = createResource(() => params.id, fetchChatProject);
  const [sessions, { refetch: refetchSessions }] = createResource(() => params.id, async () => (await fetchAgentSessions()).items);
  const refresh = () => { void refetch(); void refetchSessions(); };
  window.addEventListener("chat-projects-changed", refresh);
  onCleanup(() => window.removeEventListener("chat-projects-changed", refresh));
  const [agents] = createResource(fetchAgents);
  const [choosingAgent, setChoosingAgent] = createSignal(false);
  const [selectedAgent, setSelectedAgent] = createSignal("");
  const [instructions, setInstructions] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  createEffect(() => setInstructions(project()?.instructions ?? ""));
  const [error, setError] = createSignal("");
  const chats = () => (sessions() ?? []).filter((session) => session.projectId === params.id)
    .sort((a, b) => Number(b.pinned != null) - Number(a.pinned != null) || b.lastActivity - a.lastActivity);
  const changed = () => window.dispatchEvent(new Event("chat-projects-changed"));
  return (
    <main class="chat-project-page">
      <Show when={error() || project.error || sessions.error}><p role="alert">{error() || "Unable to load project. Try again."}</p></Show>
      <Show when={project()}>{(item) => <>
        <h1>{item().name}</h1>
        <div class="project-controls">
          <button type="button" onClick={() => { setSelectedAgent(""); setChoosingAgent(true); }}>New chat</button>
          <button type="button" onClick={async () => {
            const name = prompt("Project name", item().name);
            if (!name?.trim()) return;
            setError("");
            try { await renameChatProject(item().id, name.trim()); await refetch(); changed(); }
            catch { setError("Unable to rename project. Try again."); }
          }}>Rename</button>
          <button type="button" onClick={async () => {
            if (!confirm("Delete project? Chats will be kept.")) return;
            setError("");
            try { await deleteChatProject(item().id); changed(); navigate("/agents"); }
            catch { setError("Unable to delete project. Try again."); }
          }}>Delete project</button>
        </div>
        <Show when={choosingAgent()}>
          <div class="project-agent-picker">
            <label for="project-chat-agent">Choose an agent</label>
            <select id="project-chat-agent" value={selectedAgent()} onChange={(event) => setSelectedAgent(event.currentTarget.value)}>
              <option value="">Select an agent</option>
              <For each={agents() ?? []}>{(agent) => <option value={agent.id}>{agent.name || "Agent"}</option>}</For>
            </select>
            <Show when={agents.error}><p role="alert">Unable to load agents. Try again.</p></Show>
            <button type="button" disabled={!selectedAgent()} onClick={() => {
              const agentId = selectedAgent();
              if (!agentId) return;
              startNewChat(agentId);
              navigate(`/chat/${encodeURIComponent(agentId)}?project=${encodeURIComponent(item().id)}`);
            }}>Start chat</button>
            <button type="button" onClick={() => setChoosingAgent(false)}>Cancel</button>
          </div>
        </Show>
        <form class="project-instructions" onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try { await updateChatProjectInstructions(item().id, instructions()); await refetch(); changed(); }
          catch { setError("Unable to save instructions. Try again."); }
          finally { setSaving(false); }
        }}>
          <label for="project-instructions">Instructions</label>
          <textarea id="project-instructions" value={instructions()} onInput={(event) => setInstructions(event.currentTarget.value)} rows={6} />
          <button type="submit" disabled={saving()}>{saving() ? "Saving…" : "Save instructions"}</button>
        </form>
        <Show when={!sessions.loading && chats().length === 0}><p>No chats in this project. Use a chat's menu to move it here.</p></Show>
        <ul class="project-chats"><For each={chats()}>{(session) => <li>
          <A href={`/chat/${encodeURIComponent(session.agentId)}?session=${encodeURIComponent(session.sessionId)}`}>
            <span class="project-avatar"><Show when={session.avatar} fallback={session.agentId[0]?.toUpperCase()}>{(avatar) =>
              <Show when={avatar().startsWith("/") || /^https?:\/\//i.test(avatar())} fallback={avatar()}><img src={avatar()} alt="" /></Show>
            }</Show></span>
            <span><strong>{session.title || session.firstUserMessage || "New chat"}</strong><small>{agents()?.find((agent) => agent.id === session.agentId)?.name || "Agent"}{session.pinned != null ? " · Pinned" : ""}</small></span>
          </A>
        </li>}</For></ul>
      </>}</Show>
      <style>{`
        .chat-project-page { max-width: 800px; margin: 0 auto; padding: 32px; color: var(--text-primary); }
        .project-controls { display: flex; gap: 12px; }
        .project-controls button { padding: 8px 12px; cursor: pointer; color: var(--text-primary); background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 8px; }
        .project-agent-picker { display: flex; gap: 12px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
        .project-instructions { display: grid; gap: 8px; margin-top: 24px; }
        .project-instructions textarea { padding: 12px; color: var(--text-primary); background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 8px; resize: vertical; }
        .project-instructions button { justify-self: start; }
        .project-chats { list-style: none; padding: 0; }
        .project-chats a { display: flex; gap: 12px; padding: 14px; color: var(--text-primary); text-decoration: none; border-bottom: 1px solid var(--border-default); }
        .project-chats small { display: block; color: var(--text-secondary); margin-top: 4px; }
        .project-avatar { width: 32px; height: 32px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; background: var(--bg-raised); overflow: hidden; }
        .project-avatar img { width: 100%; height: 100%; object-fit: cover; }
      `}</style>
    </main>
  );
}
