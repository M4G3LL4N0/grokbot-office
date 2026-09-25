# AgentOS relationship

AgentOS is the provider-neutral execution substrate, not a hidden dependency of this package.

- [GrokBot Office](https://github.com/M4G3LL4N0/grokbot-office): role catalog, supervisory context, policy, and handoff.
- [AgentOS](https://github.com/M4G3LL4N0/agentos): capability discovery, routing, execution, verification, recovery, cache, and learning.
- Workers: external or local executors selected by AgentOS.
- Evidence: a shared contract, not a claim of shared ownership.

The relationship is deliberately explicit and read-only at the package boundary. A role definition is not a live AgentOS capability. Integration requires a reviewed adapter, credentials boundary, and approval policy.
