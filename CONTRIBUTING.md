# Contributing

Keep changes focused and public-safe.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm validate
pnpm validate:publication
```

Do not add private state, credentials, account data, cookies, sessions,
absolute machine paths, generated archives, or unverified metrics. Use
synthetic fixtures in examples and label simulations clearly.

For security reports, do not include secrets or private evidence in a public
issue. Provide a sanitized reproduction and use the maintainers' private
security contact process.
