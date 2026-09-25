synthetic: true
simulation: true

# Repository audit

```text
REQUEST
→ cache state
→ changed files
→ OpenCode worker
→ tests
→ verifier
→ cache artifact
→ result
```

The result is a compact audit artifact plus changed-file delta. The first
request may require a worker; a later equivalent request can retrieve the
verified artifact when its source state is unchanged.
