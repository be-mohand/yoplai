import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Modal } from "../ui/Modal";
import { TextField, TextAreaField } from "../ui/Field";
import { Button } from "../ui/Button";
import { createChatProject } from "../../api/chat-projects";

type CreateProjectModalProps = {
  onClose: () => void;
  onSuccess?: () => void;
};

export function CreateProjectModal(props: CreateProjectModalProps) {
  const navigate = useNavigate();
  const [name, setName] = createSignal("");
  const [instructions, setInstructions] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal("");
  const [createdProjectId, setCreatedProjectId] = createSignal<string | null>(null);
  let modalClosed = false;

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
      }
      if (instructions().trim()) {
        const { updateChatProjectInstructions } = await import("../../api/chat-projects");
        await updateChatProjectInstructions(projectId, instructions().trim());
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
          label="Instructions (optional)"
          placeholder="What should agents know when working in this project?"
          value={instructions()}
          onInput={(e) => setInstructions(e.currentTarget.value)}
          disabled={creating()}
          rows={4}
        />
      </form>
    </Modal>
  );
}
