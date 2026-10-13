import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { fetchAgents, fetchAgentSessions, startNewChat } from "../api";
import {
  deleteChatProjectFile,
  fetchChatProjectFiles,
  uploadChatProjectFile,
  deleteChatProject,
  fetchChatProject,
  renameChatProject,
  updateChatProjectInstructions,
  fetchChatProjectReferences,
  deleteChatProjectReference,
  fetchChatProjectNotes,
  updateChatProjectNotes,
} from "../api/chat-projects";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { TextAreaField } from "../components/ui/Field";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(timestamp).toLocaleDateString();
}

function getFileIcon(mimeType?: string): string {
  if (!mimeType) return "fa-file";
  if (mimeType.startsWith("image/")) return "fa-file-image";
  if (mimeType === "application/pdf") return "fa-file-pdf";
  if (mimeType.startsWith("text/") || mimeType.includes("json") || mimeType.includes("xml")) return "fa-file-lines";
  return "fa-file";
}

export function ChatProject() {
  const params = useParams();
  const navigate = useNavigate();
  const [project, { refetch }] = createResource(() => params.id, fetchChatProject);
  const [files, { refetch: refetchFiles }] = createResource(() => params.id, fetchChatProjectFiles);
  const [references, { refetch: refetchReferences }] = createResource(() => params.id, fetchChatProjectReferences);
  const [notes, { refetch: refetchNotes }] = createResource(() => params.id, fetchChatProjectNotes);
  const [notesText, setNotesText] = createSignal("");
  const [savingNotes, setSavingNotes] = createSignal(false);
  const [notesDirty, setNotesDirty] = createSignal(false);
  const [noteSaved, setNoteSaved] = createSignal(false);
  const [lastSubmittedNotes, setLastSubmittedNotes] = createSignal("");
  createEffect(() => {
    const text = notesData()?.text ?? "";
    if (notesText() === lastSubmittedNotes()) {
      setNotesText(text);
      setNotesDirty(false);
    }
  });
  const [uploading, setUploading] = createSignal(false);
  // Reading an errored Solid resource throws; route all render-time reads through these.
  const projectData = () => (project.error ? undefined : project());
  const fileItems = () => (files.error ? [] : files()?.items ?? []);
  const referenceItems = () => (references.error ? [] : references()?.items ?? []);
  const notesData = () => (notes.error ? undefined : notes());
  const sessionItems = () => (sessions.error ? [] : sessions() ?? []);
  const agentItems = () => (agents.error ? [] : agents() ?? []);
  const [uploadingName, setUploadingName] = createSignal("");
  const [dragging, setDragging] = createSignal(false);
  const [sessions, { refetch: refetchSessions }] = createResource(
    () => params.id,
    async () => (await fetchAgentSessions()).items
  );
  const refresh = () => {
    void refetch();
    void refetchSessions();
  };
  window.addEventListener("chat-projects-changed", refresh);
  onCleanup(() => window.removeEventListener("chat-projects-changed", refresh));
  const [agents] = createResource(fetchAgents);
  const [choosingAgent, setChoosingAgent] = createSignal(false);
  const [instructions, setInstructions] = createSignal("");
  const [savingInstructions, setSavingInstructions] = createSignal(false);
  const [instructionsDirty, setInstructionsDirty] = createSignal(false);
  const [instructionsSaved, setInstructionsSaved] = createSignal(false);
  const [lastSubmittedInstructions, setLastSubmittedInstructions] = createSignal("");
  createEffect(() => {
    const text = projectData()?.instructions ?? "";
    if (instructions() === lastSubmittedInstructions()) {
      setInstructions(text);
      setInstructionsDirty(false);
    }
  });
  const [error, setError] = createSignal("");
  const [editingTitle, setEditingTitle] = createSignal(false);
  const [titleInput, setTitleInput] = createSignal("");
  const [deletingFile, setDeletingFile] = createSignal<string | null>(null);
  const [deletingReference, setDeletingReference] = createSignal<string | null>(null);
  const [deletingProj, setDeletingProj] = createSignal(false);
  const [renamingProj, setRenamingProj] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let titleInputRef: HTMLInputElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  let menuTriggerRef: HTMLButtonElement | undefined;

  const chats = () =>
    sessionItems()
      .filter((session) => session.projectId === params.id)
      .sort((a, b) => Number(b.pinned != null) - Number(a.pinned != null) || b.lastActivity - a.lastActivity);

  const changed = () => window.dispatchEvent(new Event("chat-projects-changed"));

  createEffect(() => {
    if (!menuOpen()) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuTriggerRef && !menuTriggerRef.contains(event.target as Node)) {
        const menu = document.querySelector(".project-menu");
        if (menu && !menu.contains(event.target as Node)) {
          setMenuOpen(false);
        }
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuTriggerRef?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    });
  });

  createEffect(() => {
    if (!menuOpen() && menuTriggerRef && document.activeElement !== menuTriggerRef) {
      const wasMenuClick = menuTriggerRef.contains(document.activeElement as Node);
      if (wasMenuClick) {
        menuTriggerRef.focus();
      }
    }
  });

  const startRename = () => {
    setTitleInput(projectData()?.name ?? "");
    setEditingTitle(true);
    setMenuOpen(false);
  };

  const focusTitleInput = (el: HTMLInputElement) => {
    titleInputRef = el;
    queueMicrotask(() => {
      el.focus();
      el.select();
    });
  };

  const saveRename = async () => {
    if (!editingTitle()) return;
    const trimmed = titleInput().trim();
    if (!projectData()) return;
    if (!trimmed || trimmed === projectData()!.name) {
      cancelRename();
      return;
    }
    setEditingTitle(false);
    setError("");
    try {
      await renameChatProject(projectData()!.id, trimmed);
      await refetch();
      changed();
    } catch {
      setEditingTitle(true);
      setError("Unable to rename project. Try again.");
    }
  };

  const cancelRename = () => {
    setEditingTitle(false);
    setTitleInput(projectData()?.name ?? "");
  };

  const saveInstructions = async () => {
    if (!projectData()) return;
    const textToSave = instructions();
    setSavingInstructions(true);
    setError("");
    try {
      await updateChatProjectInstructions(projectData()!.id, textToSave);
      setLastSubmittedInstructions(textToSave);
      await refetch();
      changed();
      setInstructionsDirty(false);
      setInstructionsSaved(true);
      setTimeout(() => setInstructionsSaved(false), 1500);
    } catch {
      setError("Unable to save instructions. Try again.");
    } finally {
      setSavingInstructions(false);
    }
  };

  const saveNotes = async () => {
    if (!projectData()) return;
    const textToSave = notesText();
    setSavingNotes(true);
    setError("");
    try {
      await updateChatProjectNotes(projectData()!.id, textToSave);
      setLastSubmittedNotes(textToSave);
      setNotesDirty(false);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 1500);
    } catch {
      setError("Unable to save notes. Try again.");
    } finally {
      setSavingNotes(false);
    }
  };

  const uploadSingleFile = async (file: File) => {
    if (!projectData()) return;
    setUploadingName(file.name);
    setUploading(true);
    setError("");
    try {
      await uploadChatProjectFile(projectData()!.id, file);
      await refetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload file. Try again.");
    } finally {
      setUploading(false);
      setUploadingName("");
    }
  };

  const handleFileUpload = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await uploadSingleFile(file);
    input.value = "";
  };

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    for (const file of files) {
      await uploadSingleFile(file);
    }
  };

  const removeFile = async (fileId: string) => {
    if (!projectData()) return;
    setError("");
    try {
      await deleteChatProjectFile(projectData()!.id, fileId);
      await refetchFiles();
      setDeletingFile(null);
    } catch {
      setError("Unable to delete file. Try again.");
    }
  };

  const removeReference = async (refId: string) => {
    if (!projectData()) return;
    setError("");
    try {
      await deleteChatProjectReference(projectData()!.id, refId);
      await refetchReferences();
      setDeletingReference(null);
    } catch {
      setError("Unable to remove reference. Try again.");
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectData()) return;
    try {
      await deleteChatProject(projectData()!.id);
      changed();
      navigate("/agents");
    } catch {
      setError("Unable to delete project. Try again.");
    }
  };

  return (
    <main class="project-page">
      <Show when={error()}>
        <div class="project-error" role="alert">
          {error()}
        </div>
      </Show>
      <Show when={project.error}>
        <div class="project-not-found">
          <p>Project not found.</p>
          <A href="/agents">Back to agents</A>
        </div>
      </Show>
      <Show when={!project.error && sessions.error}>
        <div class="project-error" role="alert">
          Unable to load project. Try again.
        </div>
      </Show>
      <Show when={projectData()}>{(item) => (
        <>
          <header class="project-header">
            <div class="project-title-row">
              <i class="fa-solid fa-folder project-title-icon" aria-hidden="true" />
              <Show when={!editingTitle()} fallback={
                <input
                  ref={focusTitleInput}
                  type="text"
                  class="project-title-input"
                  value={titleInput()}
                  onInput={(e) => setTitleInput(e.currentTarget.value)}
                  onBlur={() => void saveRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  aria-label="Rename project"
                />
              }>
                <h1 class="project-title">
                  <button
                    type="button"
                    class="project-title-button"
                    onClick={startRename}
                    aria-label="Rename project"
                    title="Click to rename"
                  >
                    {item().name}
                    <i class="fa-solid fa-pencil project-title-pencil" aria-hidden="true" />
                  </button>
                </h1>
              </Show>
            </div>
            <div class="project-meta">
              <Show when={!sessions.loading && !sessions.error} fallback="—">
                {chats().length} {chats().length === 1 ? "chat" : "chats"}
              </Show>
              {" · "}
              <Show when={!files.loading && !files.error} fallback="—">
                {fileItems().length} {fileItems().length === 1 ? "file" : "files"}
              </Show>
            </div>
            <div class="project-header-actions">
              <Button variant="primary" icon="fa-solid fa-plus" onClick={() => setChoosingAgent(true)}>
                New chat
              </Button>
              <div class="project-menu-wrap">
                <Button
                  ref={menuTriggerRef}
                  variant="ghost"
                  onClick={() => setMenuOpen(!menuOpen())}
                  aria-label="Project menu"
                  aria-expanded={menuOpen()}
                  aria-haspopup="menu"
                >
                  <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true" />
                </Button>
                <Show when={menuOpen()}>
                  <div class="project-menu" role="menu">
                    <button
                      type="button"
                      class="project-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        startRename();
                      }}
                    >
                      Rename…
                    </button>
                    <button
                      type="button"
                      class="project-menu-item project-menu-item--danger"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeletingProj(true);
                      }}
                    >
                      Delete project…
                    </button>
                  </div>
                </Show>
              </div>
            </div>
          </header>

          <div class="project-body">
            <section class="project-main" aria-labelledby="chats-heading">
              <h2 id="chats-heading" class="project-section-label">Chats</h2>
              <Show when={sessions.loading}>
                <p class="project-loading">Loading</p>
              </Show>
              <Show when={sessions.error}>
                <div class="project-inline-error" role="alert">
                  Unable to load chats. Try again.
                  <Button variant="ghost" onClick={() => void refetchSessions()}>
                    Retry
                  </Button>
                </div>
              </Show>
              <Show
                when={!sessions.loading && !sessions.error && chats().length > 0}
                fallback={
                  <Show when={!sessions.loading && !sessions.error}>
                    <div class="project-empty-state">
                    <i class="fa-solid fa-folder-open" aria-hidden="true" />
                    <p>No chats yet</p>
                    <p>Start one with New chat, or move chats here from their ⋯ menu in the sidebar.</p>
                    <Button variant="primary" icon="fa-solid fa-plus" onClick={() => setChoosingAgent(true)}>
                      New chat
                    </Button>
                    </div>
                  </Show>
                }
              >
                <ul class="project-chats">
                  <For each={chats()}>{(session) => {
                    const agent = () => agentItems().find((a) => a.id === session.agentId);
                    return (
                      <li>
                        <A href={`/chat/${encodeURIComponent(session.agentId)}?session=${encodeURIComponent(session.sessionId)}`} class="project-chat-row">
                          <span class="project-chat-avatar">
                            <Show when={session.avatar} fallback={session.agentId[0]?.toUpperCase()}>
                              {(avatar) => (
                                <Show when={avatar().startsWith("/") || /^https?:\/\//i.test(avatar())} fallback={avatar()}>
                                  <img src={avatar()} alt="" />
                                </Show>
                              )}
                            </Show>
                          </span>
                          <div class="project-chat-main">
                            <div class="project-chat-title">{session.title || session.firstUserMessage || "New chat"}</div>
                            <div class="project-chat-meta">
                              {agent()?.name || session.agentId} · {relativeTime(session.lastActivity)}
                              <Show when={session.pinned != null}>
                                {" "}· <i class="fa-solid fa-thumbtack" aria-hidden="true" /> Pinned
                              </Show>
                            </div>
                          </div>
                        </A>
                      </li>
                    );
                  }}</For>
                </ul>
              </Show>
            </section>

            <div class="project-rail">
              <section class="project-card" aria-labelledby="instructions-heading">
                <div class="project-card-header">
                  <h2 id="instructions-heading" class="project-card-label">Instructions</h2>
                </div>
                <div class="project-card-body">
                  <TextAreaField
                    label=""
                    placeholder="What should agents know when working in this project?"
                    value={instructions()}
                    onInput={(e) => {
                      setInstructions(e.currentTarget.value);
                      setInstructionsDirty(true);
                      setInstructionsSaved(false);
                    }}
                    rows={5}
                    id="project-instructions"
                    aria-label="Instructions"
                  />
                  <div class="project-card-footer">
                    <Show when={instructionsSaved()}>
                    <span class="project-saved-label">Saved</span>
                  </Show>
                    <Button
                    variant="primary"
                    onClick={() => void saveInstructions()}
                    disabled={!instructionsDirty() || savingInstructions()}
                    loading={savingInstructions()}
                  >
                    Save
                  </Button>
                  </div>
                </div>
              </section>

              <section class="project-card" aria-labelledby="files-heading">
                <div class="project-card-header">
                  <h2 id="files-heading" class="project-card-label">Files</h2>
                  <Button
                    variant="ghost"
                    icon="fa-solid fa-arrow-up-from-bracket"
                    disabled={uploading()}
                    onClick={() => fileInputRef?.click()}
                  >
                    Upload
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="project-file-upload"
                    class="project-file-input"
                    onChange={handleFileUpload}
                    disabled={uploading()}
                    aria-label="Upload file"
                  />
                </div>
                <div
                  class="project-card-body"
                  classList={{ "project-card-body--dragging": dragging() }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <Show when={uploading()}>
                    <div class="project-file-uploading">Uploading {uploadingName()}…</div>
                  </Show>
                  <Show when={files.error}>
                    <p role="alert">Unable to load files. Try again.</p>
                  </Show>
                  <Show when={!files.loading && !files.error && (fileItems().length) === 0 && !uploading()}>
                    <p class="project-empty-hint">No files yet. Upload sources every chat in this project should know.</p>
                  </Show>
                  <Show when={(fileItems().length) > 0}>
                    <ul class="project-file-list">
                      <For each={fileItems()}>{(file) => (
                        <li class="project-file-row">
                          <i class={`fa-solid ${getFileIcon(file.mimeType)} project-file-icon`} aria-hidden="true" />
                          <div class="project-file-main">
                            <div class="project-file-name">{file.name}</div>
                            <div class="project-file-meta">
                              {formatBytes(file.size)}
                              <Show when={file.extractionError}>
                                {" "}· <span class="project-file-error">Text unavailable</span>
                              </Show>
                            </div>
                          </div>
                          <button
                            type="button"
                            class="project-file-remove"
                            onClick={() => setDeletingFile(file.id)}
                            aria-label={`Delete ${file.name}`}
                          >
                            <i class="fa-solid fa-xmark" aria-hidden="true" />
                          </button>
                        </li>
                      )}</For>
                    </ul>
                  </Show>
                </div>
              </section>

              <section class="project-card" aria-labelledby="references-heading">
                <div class="project-card-header">
                  <h2 id="references-heading" class="project-card-label">References</h2>
                </div>
                <div class="project-card-body">
                  <Show when={references.error}>
                    <p role="alert">Unable to load references. Try again.</p>
                    <Button variant="ghost" onClick={() => void refetchReferences()}>
                      Retry
                    </Button>
                  </Show>
                  <Show when={!references.loading && !references.error && (referenceItems().length) === 0}>
                    <p class="project-empty-hint">Agents add references here when they find useful company knowledge.</p>
                  </Show>
                  <Show when={(referenceItems().length) > 0}>
                    <ul class="project-reference-list">
                      <For each={referenceItems()}>{(reference) => (
                        <li class="project-reference-row">
                          <div class="project-reference-main">
                            <div class="project-reference-title">{reference.title}</div>
                            <div class="project-reference-description">{reference.description}</div>
                          </div>
                          <button
                            type="button"
                            class="project-reference-remove"
                            onClick={() => setDeletingReference(reference.id)}
                            aria-label={`Remove reference ${reference.title}`}
                          >
                            <i class="fa-solid fa-xmark" aria-hidden="true" />
                          </button>
                        </li>
                      )}</For>
                    </ul>
                  </Show>
                </div>
              </section>

              <section class="project-card" aria-labelledby="notes-heading">
                <div class="project-card-header">
                  <div>
                    <h2 id="notes-heading" class="project-card-label">Notes</h2>
                    <span class="project-card-hint">Agents append here; you can edit.</span>
                  </div>
                </div>
                <div class="project-card-body">
                  <Show when={notes.error}>
                    <p role="alert">Unable to load notes. Try again.</p>
                    <Button variant="ghost" onClick={() => void refetchNotes()}>
                      Retry
                    </Button>
                  </Show>
                  <Show when={!notes.error}>
                    <TextAreaField
                      label=""
                      value={notesText()}
                      onInput={(e) => {
                        setNotesText(e.currentTarget.value);
                        setNotesDirty(true);
                        setNoteSaved(false);
                      }}
                      rows={12}
                      disabled={savingNotes() || notes.loading || Boolean(notes.error)}
                      id="project-notes"
                      aria-label="Notes"
                    />
                  </Show>
                  <div class="project-card-footer">
                    <Show when={noteSaved()}>
                    <span class="project-saved-label">Saved</span>
                  </Show>
                    <Button
                    variant="primary"
                    onClick={() => void saveNotes()}
                    disabled={!notesDirty() || savingNotes() || notes.loading || Boolean(notes.error)}
                    loading={savingNotes()}
                  >
                    Save
                  </Button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      )}</Show>

      <Show when={choosingAgent()}>
        <Modal
          title={`New chat in ${projectData()?.name ?? "this project"}`}
          onClose={() => setChoosingAgent(false)}
          footer={
            <Button variant="secondary" onClick={() => setChoosingAgent(false)}>
              Cancel
            </Button>
          }
        >
          <div class="agent-picker-subtitle">Who do you want to talk to?</div>
          <Show when={agents.loading}>
            <p class="agent-picker-loading">Loading agents</p>
          </Show>
          <Show when={agents.error}>
            <p role="alert">Unable to load agents. Try again.</p>
          </Show>
          <Show when={!agents.loading && !agents.error && agentItems().length === 0}>
            <p class="agent-picker-empty">No agents available.</p>
          </Show>
          <div class="agent-picker-list">
            <For each={agentItems()}>{(agent) => (
              <button
                type="button"
                class="agent-picker-row"
                onClick={() => {
                  if (!params.id) return;
                  startNewChat(agent.id);
                  navigate(`/chat/${encodeURIComponent(agent.id)}?project=${encodeURIComponent(params.id)}`);
                }}
              >
                <span class="agent-picker-avatar">
                  <Show when={agent.avatar} fallback={agent.id[0]?.toUpperCase()}>
                    {(avatar) => (
                      <Show when={avatar().startsWith("/") || /^https?:\/\//i.test(avatar())} fallback={avatar()}>
                        <img src={avatar()} alt="" />
                      </Show>
                    )}
                  </Show>
                </span>
                <div class="agent-picker-main">
                  <div class="agent-picker-name">{agent.name || agent.id}</div>
                  <Show when={agent.description}>
                    <div class="agent-picker-description">{agent.description}</div>
                  </Show>
                </div>
              </button>
            )}</For>
          </div>
        </Modal>
      </Show>

      <Show when={deletingFile()}>
        {(fileId) => {
          const file = () => fileItems().find((f) => f.id === fileId());
          return (
            <ConfirmDialog
              title={`Delete ${file()?.name ?? "this file"}?`}
              description="This file will be removed from all chats in this project."
              confirmLabel="Delete"
              danger
              onConfirm={() => removeFile(fileId())}
              onCancel={() => setDeletingFile(null)}
            />
          );
        }}
      </Show>

      <Show when={deletingReference()}>
        {(refId) => {
          const ref = () => referenceItems().find((r) => r.id === refId());
          return (
            <ConfirmDialog
              title={`Remove ${ref()?.title ?? "this reference"}?`}
              description="This reference will be removed from the project context."
              confirmLabel="Remove"
              danger
              onConfirm={() => removeReference(refId())}
              onCancel={() => setDeletingReference(null)}
            />
          );
        }}
      </Show>

      <Show when={deletingProj()}>
        <ConfirmDialog
          title={`Delete "${projectData()?.name}"?`}
          description="Its chats are kept and go back to Recent."
          confirmLabel="Delete project"
          danger
          onConfirm={() => confirmDeleteProject()}
          onCancel={() => setDeletingProj(false)}
          error={error()}
        />
      </Show>

      <style>{`
        .project-page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 32px 40px;
          color: var(--text-primary);
        }

        @media (max-width: 900px) {
          .project-page {
            padding: 24px 20px;
          }
        }

        .project-error {
          margin: 0 0 16px;
          padding: 12px 14px;
          border-radius: 8px;
          background: color-mix(in srgb, var(--tone-error, #dc2626) 10%, transparent);
          color: var(--tone-error, #dc2626);
          font-size: 13px;
        }

        .project-header {
          margin-bottom: 32px;
        }

        .project-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 6px;
        }

        .project-title-icon {
          font-size: 20px;
          color: var(--text-secondary);
        }

        .project-title {
          margin: 0;
          font-size: 22px;
          font-weight: 650;
          letter-spacing: -0.01em;
        }

        .project-title-button {
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          font: inherit;
          padding: 2px 6px;
          margin: 0 -7px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .project-title-button:hover {
          background: var(--bg-raised);
        }

        .project-title-button:hover .project-title-pencil {
          opacity: 1;
        }

        .project-title-pencil {
          font-size: 14px;
          color: var(--text-tertiary);
          opacity: 0;
          transition: opacity 150ms;
        }

        .project-title-input {
          flex: 1;
          min-width: 0;
          border: 1px solid var(--border-default);
          border-radius: 6px;
          background: var(--bg-input, var(--bg-overlay));
          color: var(--text-primary);
          font-size: 22px;
          font-weight: 650;
          font-family: inherit;
          letter-spacing: -0.01em;
          line-height: inherit;
          padding: 2px 6px;
          margin: 0 -7px;
          outline: none;
        }

        .project-title-input:focus-visible {
          outline: 2px solid rgba(59, 130, 246, 0.6);
          outline-offset: 1px;
        }

        .project-meta {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }

        .project-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .project-menu-wrap {
          position: relative;
        }

        .project-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          min-width: 160px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 8px;
          padding: 4px;
          box-shadow: 0 4px 12px var(--shadow-md);
          z-index: 10;
        }

        .project-menu-item {
          display: block;
          width: 100%;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-primary);
          font-size: 13px;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          transition: background 150ms;
        }

        .project-menu-item:hover {
          background: var(--bg-raised);
        }

        .project-menu-item--danger {
          color: var(--tone-error, #dc2626);
        }

        .project-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 32px;
        }

        @media (max-width: 900px) {
          .project-body {
            grid-template-columns: 1fr;
          }

        }

        .project-section-label {
          margin: 0 0 12px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .project-chats {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .project-chat-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          background: transparent;
          color: var(--text-primary);
          text-decoration: none;
          transition: background 150ms;
        }

        .project-chat-row:hover {
          background: var(--bg-raised);
        }

        .project-chat-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          background: var(--bg-raised);
          overflow: hidden;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .project-chat-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .project-chat-main {
          flex: 1;
          min-width: 0;
        }

        .project-chat-title {
          font-size: 14px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .project-chat-meta {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .project-chat-meta i {
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .project-empty-state {
          padding: 48px 32px;
          text-align: center;
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          background: var(--bg-surface);
        }

        .project-empty-state > i {
          font-size: 32px;
          color: var(--text-tertiary);
          margin-bottom: 12px;
        }

        .project-empty-state p {
          margin: 0 0 8px;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.5;
        }

        .project-empty-state p:last-of-type {
          margin-bottom: 20px;
        }

        .project-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          padding: 14px 16px;
          margin-bottom: 16px;
        }

        .project-card:last-child {
          margin-bottom: 0;
        }

        .project-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .project-card-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .project-card-hint {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .project-card-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: border 150ms, background 150ms;
        }

        .project-card-body--dragging {
          border: 2px dashed var(--border-default);
          border-radius: 8px;
          padding: 8px;
          background: var(--bg-raised);
        }

        .project-file-input {
          display: none;
        }

        .project-file-uploading {
          padding: 8px 10px;
          border-radius: 6px;
          background: var(--bg-raised);
          color: var(--text-secondary);
          font-size: 12px;
        }

        .project-file-list,
        .project-reference-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .project-file-row,
        .project-reference-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          background: transparent;
          transition: background 150ms;
        }

        .project-file-row:hover,
        .project-reference-row:hover {
          background: var(--bg-raised);
        }

        .project-file-row:hover .project-file-remove,
        .project-reference-row:hover .project-reference-remove {
          opacity: 1;
        }

        .project-file-icon {
          font-size: 14px;
          color: var(--text-tertiary);
          flex-shrink: 0;
        }

        .project-file-main,
        .project-reference-main {
          flex: 1;
          min-width: 0;
        }

        .project-file-name {
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .project-reference-title {
          font-size: 13px;
          font-weight: 600;
        }

        .project-file-meta {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .project-file-error {
          color: var(--tone-error, #dc2626);
        }

        .project-reference-description {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .project-file-remove,
        .project-reference-remove {
          padding: 4px 6px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--text-tertiary);
          cursor: pointer;
          opacity: 0;
          transition: opacity 150ms, background 150ms;
          flex-shrink: 0;
        }

        .project-file-remove:hover,
        .project-reference-remove:hover {
          background: color-mix(in srgb, var(--tone-error, #dc2626) 15%, transparent);
          color: var(--tone-error, #dc2626);
        }

        .project-file-remove:focus-visible,
        .project-reference-remove:focus-visible {
          opacity: 1;
        }

        .project-empty-hint {
          margin: 0;
          padding: 8px 0;
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .project-card-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
        }

        .project-not-found {
          padding: 80px 20px;
          text-align: center;
          color: var(--text-secondary);
          font-size: 14px;
        }

        .project-not-found a {
          color: var(--text-primary);
        }

        .project-saved-label {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .project-loading,
        .agent-picker-loading,
        .agent-picker-empty {
          margin: 0;
          padding: 16px 0;
          font-size: 13px;
          color: var(--text-tertiary);
          text-align: center;
        }

        .project-inline-error {
          padding: 12px;
          border-radius: 8px;
          background: color-mix(in srgb, var(--tone-error, #dc2626) 10%, transparent);
          color: var(--tone-error, #dc2626);
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .agent-picker-subtitle {
          margin: -8px 0 12px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .agent-picker-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .agent-picker-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-primary);
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          transition: background 150ms;
        }

        .agent-picker-row:hover {
          background: var(--bg-raised);
        }

        .agent-picker-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          background: var(--bg-raised);
          overflow: hidden;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .agent-picker-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .agent-picker-main {
          flex: 1;
          min-width: 0;
        }

        .agent-picker-name {
          font-size: 14px;
          font-weight: 600;
        }

        .agent-picker-description {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </main>
  );
}
