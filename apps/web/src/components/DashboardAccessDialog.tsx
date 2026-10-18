import { For, Show, createResource, createSignal } from "solid-js";
import { fetchDashboardRecipients, saveDashboardShares, type DashboardRow, type DashboardShare } from "../api/dashboards";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { UserPicker } from "./UserPicker";

export function DashboardAccessDialog(props: { dashboard: Pick<DashboardRow, "id" | "title" | "shares">; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [recipients] = createResource(fetchDashboardRecipients);
  const [shares, setShares] = createSignal<DashboardShare[]>([...(props.dashboard.shares ?? [])]);
  const [selected, setSelected] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const users = () => recipients.error ? [] : recipients()?.users ?? [];
  const label = (share: DashboardShare) => {
    if (share.kind === "all") return "Everyone on the platform";
    const user = users().find((candidate) => candidate.id === share.id);
    return user ? `${user.name} (${user.email})` : "Unavailable account";
  };
  const add = () => {
    const id = selected();
    if (!id) return;
    setShares([...shares(), id === "all" ? { kind: "all", mode: "read" } : { kind: "user", id, mode: "read" }]);
    setSelected("");
  };
  const save = async () => {
    setBusy(true); setError(undefined);
    try { await saveDashboardShares(props.dashboard.id, shares()); await props.onSaved(); props.onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save access."); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Manage access: ${props.dashboard.title}`} onClose={props.onClose} dismissible={!busy()} error={error()}
      footer={<><Button variant="secondary" disabled={busy()} onClick={props.onClose}>Cancel</Button><Button disabled={busy() || recipients.loading || !!recipients.error} onClick={() => void save()}>{busy() ? "Saving…" : "Save"}</Button></>}>
      <p>Only you can manage access. An empty list makes this dashboard private.</p>
      <Show when={recipients.error}><p role="alert">Unable to load users.</p></Show>
      <div class="dashboard-access-add">
        <UserPicker value={selected()} onChange={setSelected} disabled={busy() || recipients.loading}
          platform={!shares().some((share) => share.kind === "all")}
          users={users().filter((user) => !shares().some((share) => share.kind === "user" && share.id === user.id)).map((user) => ({ id: user.id, label: `${user.name} (${user.email})` }))} />
        <Button disabled={busy() || !selected()} onClick={add}>Add</Button>
      </div>
      <For each={shares()} fallback={<p>Private · only you</p>}>{(share, index) => (
        <div class="dashboard-access-entry">
          <span>{label(share)}</span>
          <select aria-label={`Permission for ${label(share)}`} value={share.mode} disabled={busy()}
            onChange={(event) => { const mode = event.currentTarget.value as "read" | "write"; setShares(shares().map((entry, i) => i === index() ? { ...entry, mode } : entry)); }}>
            <option value="read">Read</option><option value="write">Write</option>
          </select>
          <Button variant="ghost" disabled={busy()} onClick={() => setShares(shares().filter((_, i) => i !== index()))}>Remove</Button>
        </div>
      )}</For>
      <p>Recipients see this page and its live query results. Write permission shows drafts; publishing also requires access to the agent.</p>
      <style>{`.dashboard-access-add, .dashboard-access-entry { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .dashboard-access-entry > span, .dashboard-access-add > select { flex: 1; min-width: 160px; } .dashboard-access-add select, .dashboard-access-entry select { padding: 8px; color: var(--text-primary); background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 5px; }`}</style>
    </Modal>
  );
}
