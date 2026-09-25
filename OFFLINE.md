# Offline and cloud operation

The registry, policy files, examples, and validators are designed to work
offline. Normal local validation performs no network calls and does not
require a live account.

A cloud or authenticated worker is an external dependency. Before using one:

1. review the adapter and data class;
2. use a dedicated account and credential boundary;
3. set a scope, timeout, spend limit, and approval gate;
4. capture evidence and make retries bounded;
5. provide a local or deterministic fallback where possible.

The [offline-cloud-supervision example](examples/offline-cloud-supervision.md)
is a simulation, not a live cloud transcript.
