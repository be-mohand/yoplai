import { Show } from "solid-js";

type ArchivedSessionBannerProps = {
  isArchived: boolean;
  onRestore: () => Promise<void>;
  onError?: (message: string) => void;
};

export function ArchivedSessionBanner(props: ArchivedSessionBannerProps) {
  return (
    <Show when={props.isArchived}>
      <div class="archived-banner">
        <i class="fa-solid fa-box-archive" aria-hidden="true" />
        <span class="archived-banner-text">
          This chat is archived. Sending a message will restore it.
        </span>
        <button
          type="button"
          class="archived-banner-restore"
          onClick={async () => {
            try {
              await props.onRestore();
            } catch (error) {
              const message = error instanceof Error ? error.message : "Failed to restore session.";
              if (props.onError) {
                props.onError(message);
              } else {
                alert(message);
              }
            }
          }}
        >
          Restore
        </button>
      </div>
    </Show>
  );
}
