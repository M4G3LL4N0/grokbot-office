# Publication Audit

Status: **public repository; verified code release**
Project: GrokBot Office 0.1.0
Repository: https://github.com/M4G3LL4N0/grokbot-office

## Public boundary

The public repository contains source, configuration, tests, canonical synthetic role metadata, documentation, and sanitized examples. It does not contain live account state, harvested material, autonomy reports, browser sessions, cookies, credentials, generated archives, or machine-specific paths.

The inherited parent Git remote is not a public project remote. The dedicated target above is the only intended publication remote.

## Workforce count semantics

The canonical source is `registry/roles.yaml` and its schema is `registry/schema.ts`.

- 134 conceptual role definitions are registered as data.
- The local reference configuration selects 3 reference supervisors.
- 131 roles remain virtual by default.
- These are reference configuration counts, not a requirement to create 134 bots or proof that an external runtime is live.

A role is not a bot. A role definition does not create, authenticate, fund, or activate an external worker.

## Excluded material

The following are private or machine-local and are excluded by policy and repository ignore rules:

- `_harvest_export/`
- `autonomy/` operational reports
- `runtime/` account, usage, and soft-stop state
- `state/` local materialization and usage state
- `generated/` reproducible output and archives
- local operational manuals
- cookies, sessions, tokens, keys, credentials, `.env` files, and database exports

The validator scans only the public candidate directories and never reads excluded private state.

## Verified release evidence

- Verified code commit: `bd499e97cf7e9df964280256815ba88e6db7409a`.
- GitHub Actions `validate`: passed; run `https://github.com/M4G3LL4N0/grokbot-office/actions/runs/36168268552`.
- `pnpm typecheck`: PASS.
- `pnpm test`: 149 passed, 0 failed, 0 skipped.
- `pnpm build`: PASS.
- `pnpm validate`: 134 roles, 3 anchors, no escalation failures or duplicate names.
- `pnpm validate:publication`: PASS.
- `pnpm grok doctor`: ALL CHECKS PASS; reference roles remain local configuration.
- `pnpm audit --prod --audit-level=high`: no known vulnerabilities found.
- No deployment, visibility change, paid provider call, or live external worker was used.

## Release checklist

- [x] Public README and cross-linked canonical docs.
- [x] Synthetic examples for the requested task classes.
- [x] CI workflow with frozen pnpm install, typecheck, tests, build, doctor, and publication validation.
- [x] Safe publication validator.
- [x] Explicit MIT license.
- [x] No deployment or private state included.
- [x] Dedicated public remote created, pushed, and verified.
- [x] GitHub Actions validation passed on the verified code commit.
- [ ] v0.1.0 release tag and GitHub release created from the final verified commit.

No local validation result is evidence of a live external worker.
