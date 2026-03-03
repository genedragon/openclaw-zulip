# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅ |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Email security concerns to the maintainers (see repository contact info).
3. Include a description of the vulnerability, steps to reproduce, and potential impact.
4. Allow reasonable time for a fix before public disclosure.

## Security Considerations

### Credentials

- **Never commit credentials to version control.** Bot tokens belong in `openclaw.json` (gitignored) or environment variables.
- Rotate API keys if you suspect exposure.
- Use `ZULIP_BOT_TOKEN` environment variable in CI/CD rather than config files.

### TLS / `insecure` Flag

The `insecure: true` config option disables TLS certificate validation. This is a **known limitation**:

- When enabled, it currently sets `NODE_TLS_REJECT_UNAUTHORIZED=0`, which affects **all** HTTPS connections in the Node.js process (not just Zulip).
- **Only use for development/testing** with self-signed certificates.
- **Never use in production.** Get a proper TLS certificate (Let's Encrypt is free).
- A future version will scope TLS bypass to Zulip connections only via per-request HTTPS agents.

### Access Control

- Default `dmPolicy` is `"pairing"` — unknown senders must be explicitly approved.
- Default `groupPolicy` is `"allowlist"` — only approved users can trigger the bot in streams.
- Setting `dmPolicy: "open"` + `allowFrom: ["*"]` exposes the bot to all Zulip users. Only do this in trusted environments.

### Input Handling

- User input (emoji names, stream names, topic names) is passed through to the Zulip REST API. Zulip performs server-side validation, but client-side validation for these fields is minimal.
- Message deduplication uses an in-memory TTL cache to prevent replay processing.

### Caching

- Stream, user, and bot info caches use `Map` objects with TTL-based expiration.
- In high-traffic deployments, monitor memory usage — caches are not size-bounded in the current version.
