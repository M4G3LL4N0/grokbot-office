# Role model

A role is a named responsibility with a parent, mission, policy metadata, and
an approval boundary. A bot is a runtime instance that may execute a role.

Role ≠ Bot.

The canonical registry is `registry/roles.yaml`; the schema is
`registry/schema.ts`. The registry currently contains 134 conceptual roles,
with 3 local reference supervisors and 131 virtual roles. This is reference
configuration, not a requirement to provision 134 bots.

## Forms

- `persistent_candidate`: durable context or session ownership may justify a
  persistent worker after approval.
- `skill`: a compact procedure with deterministic or bounded work.
- `workflow`: an evidence-backed sequence that can be reused.
- `ephemeral`: an on-demand worker for a bounded task.
- `persona`: communication or decision context, not an execution identity.

## Governance

Every materialization decision needs evidence, an approver, a resource
boundary, and a revocation path. A role with high supervisory value is not
automatically a bot. See [SECURITY.md](SECURITY.md) and [STATUS.md](STATUS.md).
