# Efficiency model

The operating pattern is:

```text
CACHE → RETRIEVE → DELTA → TRIAGE → SMALLEST CAPABLE TEAM
→ EXECUTE → VERIFY → LEARN → REUSE
```

The model optimizes for verified useful output and total resource cost. It
does not claim token savings without a measured run.

## Rules

1. Retrieve a fresh verified artifact before repeating expensive reasoning.
2. Send only the delta and a stable reference when possible.
3. Triage into cache, workflow, deterministic operation, cheap worker, then
   external specialist only when the task earns it.
4. Start with one owner; add workers only for independent, bounded work.
5. Verify output before it becomes reusable intelligence.
6. Record failures and human corrections as learning evidence.

See [CACHE.md](CACHE.md), [VERIFICATION.md](VERIFICATION.md), and
[examples/usage-aware-routing.md](examples/usage-aware-routing.md).
