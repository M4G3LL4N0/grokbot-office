# Cache and triage

A cache entry is reusable only when it has:

- a stable intent and output contract;
- a freshness and invalidation rule;
- provenance and evidence;
- a security scope;
- no secrets or private credentials.

The lookup order is exact artifact, known workflow, deterministic operation,
cheap local worker, then specialist or premium path. A miss is an honest
result, not a failure.

## Policy

Cache reusable intelligence, not unbounded source material. Prefer a compact
artifact plus a delta over a full-context replay. Invalidate by dependency
when a source changes.

See [EFFICIENCY.md](EFFICIENCY.md) and [examples/cached-repeat.md](examples/cached-repeat.md).
