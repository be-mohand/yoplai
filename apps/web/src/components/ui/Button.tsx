import { JSX, Show, splitProps } from "solid-js";

type ButtonProps = {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  loadingLabel?: string;
  icon?: string;
  children: JSX.Element;
} & JSX.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "loading", "loadingLabel", "icon", "children"]);
  const variant = () => local.variant ?? "secondary";

  return (
    <>
      <button
        type="button"
        class="ui-button"
        classList={{
          "ui-button--primary": variant() === "primary",
          "ui-button--secondary": variant() === "secondary",
          "ui-button--danger": variant() === "danger",
          "ui-button--ghost": variant() === "ghost",
        }}
        {...rest}
      >
        <Show when={local.icon}>
          {(iconClass) => <i class={iconClass()} aria-hidden="true" />}
        </Show>
        {local.loading ? (local.loadingLabel ?? "…") : local.children}
      </button>
      <style>{`
        .ui-button {
          border: 1px solid var(--border-default);
          border-radius: 8px;
          background: var(--bg-overlay);
          color: var(--text-primary);
          padding: 7px 12px;
          font-size: 13px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: inherit;
        }

        .ui-button:focus-visible {
          outline: 2px solid rgba(59, 130, 246, 0.6);
          outline-offset: 2px;
        }

        .ui-button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .ui-button:disabled,
        .ui-button--primary:disabled {
          filter: grayscale(0.6);
        }

        .ui-button--primary {
          border-color: transparent;
          background: var(--text-primary);
          color: var(--bg-base);
        }

        .ui-button--primary:hover:not(:disabled) {
          background: color-mix(in srgb, var(--text-primary) 85%, var(--bg-base));
        }

        .ui-button--danger {
          border-color: transparent;
          background: var(--color-danger, #dc2626);
          color: #fff;
        }

        .ui-button--ghost {
          border: none;
          background: transparent;
          color: var(--text-secondary);
        }

        .ui-button--ghost:hover:not(:disabled) {
          background: var(--bg-raised);
        }
      `}</style>
    </>
  );
}
