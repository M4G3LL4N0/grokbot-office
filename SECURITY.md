# Security

**BOT IDENTITY IS NOT A SECURITY BOUNDARY.**

Real isolation uses accounts, credentials, permissions, scopes, sandboxes,
approval gates, and infrastructure. Treat third-party MCP servers, skills,
repositories, workers, and generated artifacts as untrusted until reviewed.

Never put secrets in role metadata, examples, prompts, packets, logs, traces,
or backups. Use approved secret stores or environment injection. Redact
before persistence, not only before display.

## Public release boundary

The publication audit excludes harvest exports, account state, autonomy
reports, browser/session data, cookies, tokens, keys, credentials, generated
archives, and machine-specific paths. See [PUBLICATION_AUDIT.md](PUBLICATION_AUDIT.md).

## Incident response

Stop the affected executor, revoke its credential scope, preserve sanitized
evidence, identify the boundary that failed, and require human review before
re-enabling external work.
