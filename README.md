# GrokBot Office

> **GrokBot should run your workforce. It shouldn't be your entire workforce.**

GrokBot Office is a public-safe reference control layer for a large, external workforce. It keeps the persistent supervisory core small: a small set of Grok supervisors owns intent, context, policy, tradeoffs, and handoffs while replaceable workers do the bounded work.

This repository is the workforce configuration and operating model. It is not AgentOS, not a bot factory, not an operating system, and not evidence that any external worker is currently live.

## The model

```text
user / PAIOS intent
        ↓
small persistent GrokBot supervisor core
  context · queue · policy · approvals · tradeoffs · synthesis
        ↓
AgentOS execution substrate
  capability discovery · routing · bounded execution · verification · learning
        ↓
elastic workers
  local tools · models · APIs · MCP · A2A · browser or cloud executors
        ↓
evidence, handoff, and the next action
```

[AgentOS](https://github.com/M4G3LL4N0/agentos) is the provider-neutral execution and orchestration substrate. GrokBot Office supplies the workforce configuration that sits above it. The relationship is explicit and read-only at this package boundary; neither project claims ownership of the other.

The [GrokBot Office website](https://github.com/M4G3LL4N0/grokbot-office-website) presents the same model as a readable architecture reference.

## North star and core loop

**Verified useful output ÷ total resource cost**

```text
intent and context
  → choose the smallest capable owner
  → apply data, resource, and approval policy
  → route or compile a bounded task
  → hand work to a replaceable executor
  → verify the result
  → coach, record a lesson, and decide whether to reuse
```

The goal is not to make every task expensive or to create one bot per role. The goal is to make the next equivalent task cheaper by retrieving the right artifact, reducing context, and keeping the smallest capable team in control.

## Workforce counts

The checked-in registry contains:

- **134 conceptual role definitions** — responsibilities modeled as data;
- **3 reference supervisors** — the local smallest-team configuration;
- **131 virtual roles** — available as definitions but not provisioned workers.

A role is not a bot. A profile, packet, route, or `live_verified` label is not proof of execution. The registry can describe a large workforce without creating, authenticating, funding, or activating 134 external identities.

## What the package provides

- canonical role registry and schema validation;
- supervisor context, policy, handoff, and escalation contracts;
- deterministic routing and workflow compilation aids;
- synthetic A2A, cache, workflow, resource-governor, and verification examples;
- local validation and a publication boundary validator.

The package does not scrape usage, invent quota data, run paid providers, or claim a live external workforce.

## Honest status categories

| Category | Boundary |
| --- | --- |
| **VERIFIED** | Registry validation, role/profile data, local typecheck, 149 tests, build, doctor, synthetic examples, and publication validation. |
| **OPTIONAL** | External workers, adapters, A2A/MCP boundaries, cloud supervision, and human review loops when their credentials and policies are explicitly configured. |
| **UNCONFIGURED** | Live accounts, provider credentials, browser sessions, cloud workers, and production account state. |
| **EXPERIMENTAL** | Resource-governor extensions, ecosystem scouting, and learned routing that still need measured operator evidence before consequential use. |
| **PLANNED** | Reviewed external adapters, human approval UX, portable manifests, and optional cloud supervision behind explicit resource policy. |

## Quickstart

```bash
git clone https://github.com/M4G3LL4N0/grokbot-office.git
cd grokbot-office
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm validate
pnpm validate:publication
pnpm grok doctor
```

Run state-changing commands only against a deliberate local state directory. The publication validator is stdlib-only and performs no network access.

## Core documents

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — control-core and worker boundaries.
- [`ROLE_MODEL.md`](ROLE_MODEL.md) — role, anchor, and virtual-role semantics.
- [`AGENTOS.md`](AGENTOS.md) — the explicit AgentOS relationship.
- [`RESOURCE_GOVERNOR.md`](RESOURCE_GOVERNOR.md) — measured policy and bounded fan-out.
- [`VERIFICATION.md`](VERIFICATION.md) — evidence and coach boundaries.
- [`WORKFLOWS.md`](WORKFLOWS.md) — configuration-only workflow contracts.
- [`OFFLINE.md`](OFFLINE.md) — offline and optional cloud operation.
- [`SECURITY.md`](SECURITY.md) — credentials, identity, and public boundary.
- [`PUBLICATION_AUDIT.md`](PUBLICATION_AUDIT.md) — the release candidate audit.

## Examples

The [`examples/`](examples/) directory contains synthetic simulations for repository audit, cached repeats, workflow compilation, location intelligence, ecosystem scouting, offline/cloud supervision, and usage-aware routing. They contain no private values and are not runtime evidence.

## Security and contribution

Keep credentials out of prompts, configuration, source, examples, logs, and state. Treat every external worker, MCP server, skill, and generated artifact as untrusted until reviewed. Read [`SECURITY.md`](SECURITY.md) before sharing anything and follow [`CONTRIBUTING.md`](CONTRIBUTING.md) before proposing a change.

## License

MIT. See [`LICENSE`](LICENSE).
