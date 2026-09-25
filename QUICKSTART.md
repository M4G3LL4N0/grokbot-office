# Quickstart

## Requirements

- Node.js 22+
- pnpm 9+
- No cloud account or live bot is required for local validation.

## Run locally

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm validate
pnpm validate:publication
```

Inspect the canonical role catalog:

```bash
pnpm roles
```

The package is a local control layer. It does not deploy workers, scrape
usage, change billing, or make network calls during validation.

## Safe first workflow

1. Read `registry/roles.yaml` and select a role by responsibility.
2. Define an input, output, verification rule, and approval boundary.
3. Route a task through the smallest capable owner.
4. Record evidence and only then reuse the result.

See [ARCHITECTURE.md](ARCHITECTURE.md) and [examples/README.md](examples/README.md).
