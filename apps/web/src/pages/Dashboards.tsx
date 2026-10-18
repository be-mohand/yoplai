import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { deleteDashboard, fetchDashboards, type DashboardRow } from "../api/dashboards";
import { DashboardAccessDialog } from "../components/DashboardAccessDialog";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Button } from "../components/ui/Button";

export function Dashboards() {
  const [dashboards, { refetch }] = createResource(fetchDashboards);
  const [managing, setManaging] = createSignal<DashboardRow>();
  const [deleting, setDeleting] = createSignal<DashboardRow>();
  const [deleteError, setDeleteError] = createSignal<string>();
  const data = () => dashboards.error ? undefined : dashboards();
  const groups = createMemo(() => {
    const result = new Map<string, { name: string; rows: DashboardRow[] }>();
    for (const row of data()?.owned ?? []) {
      const group = result.get(row.agentId) ?? { name: row.agentName, rows: [] };
      group.rows.push(row);
      result.set(row.agentId, group);
    }
    return [...result.values()];
  });
  const row = (dashboard: DashboardRow) => (
    <li class="dashboard-row">
      <div><strong>{dashboard.title}</strong><p>Published {dashboard.publishedAt ? new Date(dashboard.publishedAt).toLocaleString() : "—"} · {dashboard.shares?.length ? dashboard.shares.some((share) => share.kind === "all") ? "Everyone on the platform" : `${dashboard.shares.length} selected users` : "Private"}</p></div>
      <Show when={dashboard.params.length === 0} fallback={<span>Needs parameters: {dashboard.params.join(", ")}</span>}>
        <a href={dashboard.link} target="_blank" rel="noopener noreferrer">Open</a>
      </Show>
      <Button variant="secondary" onClick={() => setManaging(dashboard)}>Manage access</Button>
      <Button variant="danger" onClick={() => { setDeleteError(undefined); setDeleting(dashboard); }}>Delete</Button>
    </li>
  );
  return (
    <main class="dashboards-page">
      <h1>Dashboards</h1>
      <Show when={dashboards.error}><p role="alert">Unable to load dashboards. <button onClick={() => window.location.reload()}>Retry</button></p></Show>
      <Show when={dashboards.loading}><p>Loading dashboards…</p></Show>
      <section><h2>My dashboards</h2>
        <For each={groups()} fallback={<Show when={!dashboards.loading && !dashboards.error}><p>You do not own any dashboards yet.</p></Show>}>{(group) => (
          <section><h3>{group.name}</h3><ul><For each={group.rows}>{row}</For></ul></section>
        )}</For>
      </section>
      <Show when={managing()}>{(dashboard) => <DashboardAccessDialog dashboard={dashboard()} onClose={() => setManaging(undefined)} onSaved={async () => { await refetch(); }} />}</Show>
      <Show when={deleting()}>{(dashboard) => <ConfirmDialog title="Delete dashboard" description={`Delete ${dashboard().title} and its published HTML and history? Shared databases are retained.`} confirmLabel="Delete" danger error={deleteError()} onCancel={() => setDeleting(undefined)} onConfirm={async () => {
        try { await deleteDashboard(dashboard().id); await refetch(); setDeleting(undefined); }
        catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Unable to delete dashboard."); }
      }} />}</Show>
      <section><h2>Shared with me</h2>
        <ul><For each={data()?.shared ?? []} fallback={<Show when={!dashboards.loading && !dashboards.error}><li>No dashboards have been shared with you.</li></Show>}>{(dashboard) => (
          <li class="dashboard-row"><div><strong>{dashboard.title}</strong><p>{dashboard.ownerName} · {dashboard.mode} · {dashboard.agentName}</p></div>
            <Show when={dashboard.params.length === 0} fallback={<span>Needs parameters: {dashboard.params.join(", ")}</span>}><a href={dashboard.link} target="_blank" rel="noopener noreferrer">Open</a></Show>
          </li>
        )}</For></ul>
      </section>
      <style>{`
        .dashboards-page { flex: 1; min-width: 0; overflow: auto; padding: 32px; color: var(--text-primary); }
        .dashboards-page > section { margin-top: 32px; }
        .dashboards-page h1 { font-size: 24px; }
        .dashboards-page h2 { font-size: 19px; }
        .dashboards-page h3 { font-size: 15px; color: var(--text-secondary); }
        .dashboards-page ul { list-style: none; padding: 0; }
        .dashboard-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--border-default); }
        .dashboard-row > div:first-child { flex: 1; min-width: 180px; }
        .dashboard-row p { font-size: 13px; color: var(--text-secondary); margin: 6px 0 0; }
        .dashboard-row a { color: var(--text-primary); }
      `}</style>
    </main>
  );
}
