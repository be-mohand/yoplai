import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Modal } from "../ui/Modal";
import { TextField, TextAreaField } from "../ui/Field";
import { Button } from "../ui/Button";
import { createChatProject, draftChatProjectInstructions, uploadChatProjectFile } from "../../api/chat-projects";

type CreateProjectModalProps = {
  onClose: () => void;
  onSuccess?: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreateProjectModal(props: CreateProjectModalProps) {
  const navigate = useNavigate();
  const [name, setName] = createSignal("");
  const [purpose, setPurpose] = createSignal("");
  const [files, setFiles] = createSignal<File[]>([]);
  const [dragging, setDragging] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal("");
  const [createdProjectId, setCreatedProjectId] = createSignal<string | null>(null);
  const [draftDone, setDraftDone] = createSignal(false);
  const [phase, setPhase] = createSignal<"creating" | "drafting" | "uploading">("creating");
  let modalClosed = false;
  let fileInput: HTMLInputElement | undefined;

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((current) => [...current, ...incoming]);
  };

  const handleCreate = async () => {
    const trimmedName = name().trim();
    if (!trimmedName) return;

    setCreating(true);
    setError("");
    try {
      let projectId = createdProjectId();
      if (!projectId) {
        const project = await createChatProject(trimmedName);
        projectId = project.id;
        setCreatedProjectId(projectId);
        window.dispatchEvent(new Event("chat-projects-changed"));
      }
      const trimmedPurpose = purpose().trim();
      if (trimmedPurpose && !draftDone()) {
        setPhase("drafting");
        await draftChatProjectInstructions(projectId, trimmedPurpose);
        setDraftDone(true);
      }
      setPhase("uploading");
      // Files leave the list as they upload, so a retry only sends what failed.
      for (const file of [...files()]) {
        await uploadChatProjectFile(projectId, file);
        setFiles((current) => current.filter((item) => item !== file));
      }
      window.dispatchEvent(new Event("chat-projects-changed"));
      if (!modalClosed) {
        props.onSuccess?.();
        props.onClose();
        navigate(`/p/${projectId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create project. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    void handleCreate();
  };

  return (
    <Modal
      title="Create project"
      onClose={() => {
        modalClosed = true;
        props.onClose();
      }}
      dismissible={!creating()}
      error={error()}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose} disabled={creating()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleCreate()}
            disabled={!name().trim() || creating()}
            loading={creating()}
            loadingLabel={
              phase() === "drafting" ? "Drafting instructions…" : phase() === "uploading" && files().length > 0 ? "Uploading files…" : undefined
            }
          >
            Create
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
        <TextField
          label="Name"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          disabled={creating()}
          autofocus
          required
        />
        <TextAreaField
          label="What's the purpose of this project? (optional)"
          placeholder="e.g. Prepare our Q3 board deck from finance and sales data"
          value={purpose()}
          onInput={(e) => setPurpose(e.currentTarget.value)}
          disabled={creating() || !!createdProjectId()}
          rows={4}
        />
        <div class="create-project-files">
          <button
            type="button"
            class="create-project-dropzone"
            classList={{ "create-project-dropzone--dragging": dragging() }}
            disabled={creating()}
            onClick={() => fileInput?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!creating()) addFiles(Array.from(e.dataTransfer?.files ?? []));
            }}
          >
            <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true" />
            <span>Add files (optional) — drop or click to browse</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            data-testid="create-project-file-input"
            aria-label="Add files"
            onChange={(e) => {
              addFiles(Array.from(e.currentTarget.files ?? []));
              e.currentTarget.value = "";
            }}
          />
          <Show when={files().length > 0}>
            <ul class="create-project-file-list">
              <For each={files()}>
                {(file) => (
                  <li class="create-project-file-chip">
                    <span class="create-project-file-name">{file.name}</span>
                    <span class="create-project-file-size">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      class="create-project-file-remove"
                      aria-label={`Remove ${file.name}`}
                      disabled={creating()}
                      onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                    >
                      <i class="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </form>
      <style>{`
        .create-project-dropzone {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 12px;
          border: 1px dashed var(--border-default);
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          font: inherit;
          font-size: 13px;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
        }
        .create-project-dropzone:hover:not(:disabled),
        .create-project-dropzone--dragging {
          background: var(--bg-raised);
          border-color: var(--text-secondary);
          color: var(--text-primary);
        }
        .create-project-dropzone:disabled { cursor: not-allowed; opacity: 0.5; }
        .create-project-file-list {
          list-style: none;
          margin: 8px 0 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .create-project-file-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
          padding: 3px 4px 3px 10px;
          border: 1px solid var(--border-default);
          border-radius: 999px;
          background: var(--bg-raised);
          font-size: 12px;
          color: var(--text-primary);
        }
        .create-project-file-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .create-project-file-size { color: var(--text-secondary); white-space: nowrap; }
        .create-project-file-remove {
          border: none;
          background: transparent;
          color: var(--text-secondary);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          cursor: pointer;
          transition: background 160ms ease, color 160ms ease;
        }
        .create-project-file-remove:hover:not(:disabled) {
          background: var(--bg-overlay);
          color: var(--text-primary);
        }
      `}</style>
    </Modal>
  );
}
