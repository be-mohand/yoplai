# ALG-429 E2E validation

- Branch: `ALG-429-maintenance-auto-title`
- Isolated home: `.yoplai-e2e`
- Gateway/UI: `http://127.0.0.1:4100`, `http://127.0.0.1:3101`
- Model: local deterministic OpenAI-compatible endpoint (`validation/mock-openai.mjs`); stored dummy API key exercised ModelRuntime credential resolution without external secrets.
- Tests: focused maintenance tests (9 passed), `pnpm test:gateway` (599 passed), `pnpm test:shared` (190 passed), `pnpm typecheck` (passed).
- API: POSTed the first core turn through `/api/agents/assistant/messages`; response completed before the title meta was appended. `/api/agents/sessions` then returned `title: "Quarterly Budget Planning"`.
- Persistence: canonical history contains one user message, one assistant message, then `{ "type": "meta", "key": "title" }`.
- Browser: real web UI sidebar rendered `Quarterly Budget Planning`; screenshot and DOM are `04-sidebar.png` and `04-sidebar.dom.txt`.
- Evidence: `01-run-response.json`, `02-sessions.json`, `03-history-tail.txt`, `04-sidebar.png`, `04-sidebar.dom.txt`.
