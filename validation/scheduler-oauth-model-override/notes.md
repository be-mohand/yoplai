# Scheduled OAuth model override validation

- Branch: current worktree
- Tests: `pnpm test:gateway`; exact scheduler service, container OAuth, container adapter, internal renewal endpoint, and Pi adapter tests; `pnpm typecheck`; scoped ESLint.
- Covered: scheduler forwards the model override; an API-key agent's override resolves stored OAuth credentials; sandbox input receives the token; renewal is restricted to the run-scoped provider; host Pi uses the override credential.
- Live OAuth E2E: user verified the original scheduled job on the dev gateway successfully uses its `openai-codex` override. An isolated-home rerun was not possible without copying a real/customer OAuth credential into test state.
- Browser/API persistence checks: not applicable to this gateway runtime-only change.
