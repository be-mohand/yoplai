import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { fetchAgents, fetchAgentSessions, startNewChat } from "../api";
import { deleteChatProjectFile, fetchChatProjectFiles, uploadChatProjectFile, deleteChatProject, fetchChatProject, renameChatProject, updateChatProjectInstructions, fetchChatProjectReferences, deleteChatProjectReference, fetchChatProjectNotes, updateChatProjectNotes } from "../api/chat-projects";

export function ChatProject() {
  const params = useParams();
  const navigate = useNavigate();
  const [project, { refetch }] = createResource(() => params.id, fetchChatProject);
  const [files, { refetch: refetchFiles }] = createResource(() => params.id, fetchChatProjectFiles);
  const [references, { refetch: refetchReferences }] = createResource(() => params.id, fetchChatProjectReferences);
  const [notes, { refetch: refetchNotes }] = createResource(() => params.id, fetchChatProjectNotes);
  const [notesText, setNotesText] = createSignal("");
  const [savingNotes, setSavingNotes] = createSignal(false);
  const [tab, setTab] = createSignal<"overview" | "notes">("overview");
  createEffect(() => setNotesText(notes()?.text ?? ""));
  const [uploading, setUploading] = createSignal(false);
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
        <div role="tablist" aria-label="Project content" class="project-agent-picker">
          <button type="button" role="tab" id="project-overview-tab" aria-selected={tab() === "overview"} aria-controls="project-overview" onClick={() => setTab("overview")}>Overview</button>
          <button type="button" role="tab" id="project-notes-tab" aria-selected={tab() === "notes"} aria-controls="project-notes-panel" onClick={() => setTab("notes")}>Notes</button>
        </div>
        <Show when={tab() === "notes"}>
          <section role="tabpanel" id="project-notes-panel" aria-labelledby="project-notes-tab">
            <Show when={notes.error}><p role="alert">Unable to load notes. Try again.</p><button type="button" onClick={() => void refetchNotes()}>Retry notes</button></Show>
            <form class="project-instructions" onSubmit={async (event) => {
              event.preventDefault(); setSavingNotes(true); setError("");
              try { await updateChatProjectNotes(item().id, notesText()); await refetchNotes(); }
              catch { setError("Unable to save notes. Try again."); }
              finally { setSavingNotes(false); }
            }}>
              <label for="project-notes">Notes</label>
              <textarea id="project-notes" value={notesText()} onInput={(event) => setNotesText(event.currentTarget.value)} rows={12} disabled={savingNotes() || notes.loading || Boolean(notes.error)} />
              <button type="submit" disabled={savingNotes() || notes.loading || Boolean(notes.error)}>{savingNotes() ? "Saving…" : "Save notes"}</button>
            </form>
          </section>
        </Show>
        <Show when={tab() === "overview"}>
        <section role="tabpanel" id="project-overview" aria-labelledby="project-overview-tab">
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
        <section class="project-instructions" aria-label="Project files">
          <h2>Files</h2>
          <label for="project-file-upload">Upload file</label>
          <input id="project-file-upload" type="file" disabled={uploading()} onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            setUploading(true); setError("");
            try { await uploadChatProjectFile(item().id, file); await refetchFiles(); }
            catch (error) { setError(error instanceof Error ? error.message : "Unable to upload file. Try again."); }
            finally { setUploading(false); input.value = ""; }
          }} />
          <Show when={uploading()}><p>Uploading…</p></Show>
          <Show when={files.error}><p role="alert">Unable to load files. Try again.</p></Show>
          <ul><For each={files()?.items ?? []}>{(file) => <li>
            <span>{file.name} · {file.size} bytes{file.extractionError ? " · Text extraction unavailable" : ""}</span>
            <button type="button" aria-label={`Delete ${file.name}`} onClick={async () => {
              setError("");
              try { await deleteChatProjectFile(item().id, file.id); await refetchFiles(); }
              catch { setError("Unable to delete file. Try again."); }
            }}>Delete</button>
          </li>}</For></ul>
        </section>
        <section class="project-instructions" aria-label="Project references">
          <h2>References</h2>
          <Show when={references.error}><p role="alert">Unable to load references. Try again.</p><button type="button" onClick={() => void refetchReferences()}>Retry references</button></Show>
          <Show when={!references.loading && !references.error && references()?.items.length === 0}><p>No references yet.</p></Show>
          <ul><For each={references()?.items ?? []}>{(reference) => <li>
            <strong>{reference.title}</strong><p>{reference.description}</p>
            <button type="button" aria-label={`Remove reference ${reference.title}`} onClick={async () => {
              setError("");
              try { await deleteChatProjectReference(item().id, reference.id); await refetchReferences(); }
              catch { setError("Unable to remove reference. Try again."); }
            }}>Remove</button>
          </li>}</For></ul>
        </section>
        <Show when={!sessions.loading && chats().length === 0}><p>No chats in this project. Use a chat's menu to move it here.</p></Show>
        <ul class="project-chats"><For each={chats()}>{(session) => <li>
          <A href={`/chat/${encodeURIComponent(session.agentId)}?session=${encodeURIComponent(session.sessionId)}`}>
            <span class="project-avatar"><Show when={session.avatar} fallback={session.agentId[0]?.toUpperCase()}>{(avatar) =>
              <Show when={avatar().startsWith("/") || /^https?:\/\//i.test(avatar())} fallback={avatar()}><img src={avatar()} alt="" /></Show>
            }</Show></span>
            <span><strong>{session.title || session.firstUserMessage || "New chat"}</strong><small>{agents()?.find((agent) => agent.id === session.agentId)?.name || "Agent"}{session.pinned != null ? " · Pinned" : ""}</small></span>
          </A>
        </li>}</For></ul>
        </section>
        </Show>
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
