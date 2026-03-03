# Contributing

## Development Setup

1. Clone this repo into `~/.openclaw/extensions/zulip/`
2. Symlink dependencies:
   ```bash
   OPENCLAW_DIR=$(dirname $(dirname $(which openclaw)))
   mkdir -p node_modules
   ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw/node_modules/zod" node_modules/zod
   ln -sf "$OPENCLAW_DIR/lib/node_modules/openclaw" node_modules/openclaw
   ```
3. Restart the gateway: `openclaw gateway restart`
4. Watch logs: `tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep zulip`

## Code Style

- TypeScript, no compilation needed (OpenClaw uses `jiti` for runtime TS loading)
- Import from `openclaw/plugin-sdk` for shared utilities
- Use `.js` extensions in imports (ESM resolution)

## Pre-Commit Checklist

- [ ] No hardcoded credentials (grep for API keys, tokens, passwords)
- [ ] No personal URLs or hostnames in code or comments
- [ ] `insecure` flag usage documented with warnings
- [ ] New config options added to `config-schema.ts` (Zod validation)
- [ ] README updated for new features

## Security

Before submitting a PR:

```bash
# Scan for potential credential leaks
git grep -i 'password\|secret\|token\|api.key\|apikey' -- ':!*.md' ':!*.json'
git grep -E '[A-Za-z0-9]{20,}' -- '*.ts'  # Long strings that might be keys
```

See [SECURITY.md](SECURITY.md) for disclosure policy.
