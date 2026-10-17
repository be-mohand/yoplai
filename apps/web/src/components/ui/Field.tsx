import { JSX, Show, splitProps } from "solid-js";

type TextFieldProps = {
  label: string;
  error?: string;
  id?: string;
} & JSX.InputHTMLAttributes<HTMLInputElement>;

export function TextField(props: TextFieldProps) {
  const [local, rest] = splitProps(props, ["label", "error", "id"]);
  const inputId = () => local.id ?? `field-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <label class="ui-field">
      <span class="ui-field__label">{local.label}</span>
      <input
        class="ui-field__input"
        classList={{ "ui-field__input--error": Boolean(local.error) }}
        type="text"
        id={inputId()}
        {...rest}
      />
      <Show when={local.error}>
        {(message) => <span class="ui-field__error" role="alert">{message()}</span>}
      </Show>
      <style>{`
        .ui-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .ui-field__label {
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
        }

        .ui-field__input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border-default);
          border-radius: 6px;
          background: var(--bg-overlay);
          color: var(--text-primary);
          padding: 8px 10px;
          font-size: 13px;
          font-family: inherit;
        }

        .ui-field__input:focus-visible {
          outline: 2px solid rgba(59, 130, 246, 0.6);
          outline-offset: 2px;
        }

        .ui-field__input--error {
          border-color: var(--tone-error, #dc2626);
        }

        .ui-field__error {
          color: var(--tone-error, #dc2626);
          font-size: 12px;
        }
      `}</style>
    </label>
  );
}

type TextAreaFieldProps = {
  label: string;
  error?: string;
  id?: string;
} & JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextAreaField(props: TextAreaFieldProps) {
  const [local, rest] = splitProps(props, ["label", "error", "id"]);
  const inputId = () => local.id ?? `field-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <label class="ui-field">
      <span class="ui-field__label">{local.label}</span>
      <textarea
        class="ui-field__input ui-field__textarea"
        classList={{ "ui-field__input--error": Boolean(local.error) }}
        id={inputId()}
        {...rest}
      />
      <Show when={local.error}>
        {(message) => <span class="ui-field__error" role="alert">{message()}</span>}
      </Show>
      <style>{`
        .ui-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .ui-field__label {
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
        }

        .ui-field__input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border-default);
          border-radius: 6px;
          background: var(--bg-overlay);
          color: var(--text-primary);
          padding: 8px 10px;
          font-size: 13px;
          font-family: inherit;
        }

        .ui-field__textarea {
          resize: vertical;
        }

        .ui-field__input:focus-visible {
          outline: 2px solid rgba(59, 130, 246, 0.6);
          outline-offset: 2px;
        }

        .ui-field__input--error {
          border-color: var(--tone-error, #dc2626);
        }

        .ui-field__error {
          color: var(--tone-error, #dc2626);
          font-size: 12px;
        }
      `}</style>
    </label>
  );
}
