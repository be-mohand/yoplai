# Canvas file contract

- Dashboard files are single HTML documents at `data/dashboards/<slug>.html`.
- `data-db` is a path relative to the workspace root, such as `data/app.db`. Keep databases under `data/`; sandboxed agents can only read databases there.
- Live query:

```html
<script type="application/sql" data-name="items" data-db="data/app.db">
  SELECT * FROM items WHERE lower(owner_email) = lower(:viewer_email)
</script>
```

- Page code goes in one `<script type="module">`; classic inline scripts share the browser's global scope and break on names like `top`. Module scripts run after the SQL results are injected.
- Query results are injected before page scripts as `YOPLAI.data.items`.
- `YOPLAI.viewer` contains `email` and `name`; `YOPLAI.params` contains URL query parameters.
- `YOPLAI.link("client.html", { id: row.id })` makes a safe same-agent drill-down URL.
- Any dashboard that is meaningless without URL arguments must declare them in its head: `<meta name="yoplai:params" content="id">` (comma-separated for multiple required arguments, e.g. `content="id,quarter"`). The agent's Dashboards tab shows these pages as non-clickable children of every dashboard linking to them via `YOPLAI.link`; unreachable pages appear under "Needs parameters". Do not declare optional arguments, such as OKR owner/period filters with defaults.
- Call `dashboard_create({ slug: "client.html" })` once to privately register/publish as the requester. Registered slugs cannot be taken over. Call `dashboard_update` to publish edits. Both return the absolute `link`, SQL diagnostics (`queryErrors`) and static checks (`problems`). `dashboard_link({ slug? })` returns readable links only; it never registers, publishes, diagnoses or records history.
- A page may have 20 queries. Each has a two-second, 5,000-row, 5MB result limit. Keep queries read-only and bounded.

Publication diagnostics execute SQL with `:viewer_email`, `:viewer_name`, and URL params set to null. Before sharing, replace placeholders with quoted real values and run the queries through `sqlite3`.

Owners/writers see live working HTML; read-only viewers see durable published HTML and metadata. SQL remains live. Manage selected-user/platform-wide read/write grants from **Dashboards**, without requiring agent membership; publishing requires agent execution access. Legacy pages stay agent-gated/live until claimed privately. Drill-down pages have independent grants and unavailable targets are omitted. Never share internal agent-token preview URLs or reveal pages the requester cannot access.
