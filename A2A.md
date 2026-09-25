# A2A federation

A2A packets describe tasks and results between reviewed peers. They do not
grant trust.

```mermaid
sequenceDiagram
  participant G as GrokBot Office
  participant A as AgentOS cell
  participant W as Worker
  G->>A: TASK + scope + deadline
  A->>W: bounded execution request
  W-->>A: result + evidence
  A-->>G: RESULT + verification state
```

Every packet should carry a task id, capability, data class, requester,
approval state, and evidence references. Reject credentials in packets. Use
separate accounts, credentials, permissions, and infrastructure for real
isolation. See [SECURITY.md](SECURITY.md).
