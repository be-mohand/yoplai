import { Show, createSignal } from "solid-js";
import { ToastNotification, type ToastVariant } from "../components/ui/Toast";

type ToastState = {
  id: number;
  message: string;
  variant: ToastVariant;
} | null;

let toastIdCounter = 0;
const [toast, setToast] = createSignal<ToastState>(null);

export function showToast(message: string, variant: ToastVariant = "info") {
  setToast({
    id: ++toastIdCounter,
    message,
    variant,
  });
}

export function ToastHost() {
  return (
    <Show when={toast()} keyed>
      {(currentToast) => (
        <ToastNotification
          message={currentToast.message}
          variant={currentToast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </Show>
  );
}
