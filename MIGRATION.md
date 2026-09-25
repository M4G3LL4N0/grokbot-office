# Setup and migration notes

## Fresh public checkout

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm validate
pnpm validate:publication
```

## Existing local operator

1. Keep `state/`, `runtime/`, `autonomy/`, and generated archives private.
2. Copy only reviewed policy and sanitized registry data into a clean
   candidate.
3. Re-run validation before sharing.
4. Select a dedicated public remote; do not reuse an inherited parent remote
   without checking visibility and history.
5. Obtain maintainer approval for the license and any external integration.

No migration step enables a bot, account, browser session, or paid provider.
