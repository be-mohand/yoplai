import { For } from "solid-js";

export function UserPicker(props: {
  users: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  class?: string;
}) {
  return (
    <select aria-label="Select a user" class={props.class} value={props.value} disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.value)}>
      <option value="">Select a user…</option>
      <For each={props.users}>{(user) => <option value={user.id}>{user.label}</option>}</For>
    </select>
  );
}
