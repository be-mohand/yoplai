import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createResource, createSignal, onCleanup } from "solid-js";
import { fetchAgentSessions } from "../api";
import { deleteChatProject, fetchChatProject, renameChatProject } from "../api/chat-projects";

export function ChatProject() {
  const params = useParams();
  const navigate = useNavigate();
  const [project, { refetch }] = createResource(() => params.id, fetchChatProject);
  const [sessions, { refetch: refetchSessions }] = createResource(() => params.id, async () => (await fetchAgentSessions()).items);
  const refresh = () => { void refetch(); void refetchSessions(); };
  window.addEventListener("chat-projects-changed", refresh);
  onCleanup(() => window.removeEventListener("chat-projects-changed", refresh));
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
        <Show when={!sessions.loading && chats().length === 0}><p>No chats in this project. Use a chat's menu to move it here.</p></Show>
        <ul class="project-chats"><For each={chats()}>{(session) => <li>
          <A href={`/chat/${encodeURIComponent(session.agentId)}?session=${encodeURIComponent(session.sessionId)}`}>
            <span class="project-avatar"><Show when={session.avatar} fallback={session.agentId[0]?.toUpperCase()}>{(avatar) =>
              <Show when={avatar().startsWith("/") || /^https?:\/\//i.test(avatar())} fallback={avatar()}><img src={avatar()} alt="" /></Show>
            }</Show></span>
            <span><strong>{session.title || session.firstUserMessage || session.sessionId}</strong><small>{session.agentId}{session.pinned != null ? " · Pinned" : ""}</small></span>
          </A>
        </li>}</For></ul>
      </>}</Show>
      <style>{`
        .chat-project-page { max-width: 800px; margin: 0 auto; padding: 32px; color: var(--text-primary); }
        .project-controls { display: flex; gap: 12px; }
        .project-controls button { padding: 8px 12px; cursor: pointer; color: var(--text-primary); background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 8px; }
        .project-chats { list-style: none; padding: 0; }
        .project-chats a { display: flex; gap: 12px; padding: 14px; color: var(--text-primary); text-decoration: none; border-bottom: 1px solid var(--border-default); }
        .project-chats small { display: block; color: var(--text-secondary); margin-top: 4px; }
        .project-avatar { width: 32px; height: 32px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; background: var(--bg-raised); overflow: hidden; }
        .project-avatar img { width: 100%; height: 100%; object-fit: cover; }
      `}</style>
    </main>
  );
}
