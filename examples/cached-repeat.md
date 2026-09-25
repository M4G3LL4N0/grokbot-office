synthetic: true
simulation: true

# Cached repeat

```text
first request  → reason → verify → compile artifact
second request → retrieve artifact → verify freshness → reuse
```

If the source hash changes, the artifact becomes stale and the system routes
to a fresh worker. No token-saving claim is made without a measured run.
