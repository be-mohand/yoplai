import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { deleteDashboard, fetchDashboards, type DashboardRow } from "../api/dashboards";
import { DashboardAccessDialog } from "../components/DashboardAccessDialog";
import { DashboardListRow } from "../components/DashboardListRow";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";

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
    <li><DashboardListRow dashboard={dashboard} onManage={() => setManaging(dashboard)}
      onDelete={() => { setDeleteError(undefined); setDeleting(dashboard); }} /></li>
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
          <li><DashboardListRow dashboard={dashboard} showAgent reserveDelete /></li>
        )}</For></ul>
      </section>
      <style>{`
        .dashboards-page { flex: 1; min-width: 0; overflow: auto; padding: 32px; color: var(--text-primary); }
        .dashboards-page > section { margin-top: 32px; }
        .dashboards-page h1 { font-size: 24px; }
        .dashboards-page h2 { font-size: 19px; }
        .dashboards-page h3 { font-size: 15px; color: var(--text-secondary); }
        .dashboards-page ul { list-style: none; padding: 0; }
      `}</style>
    </main>
  );
}
