# Changelog

## 2026.3.2

### Added
- **Zulip Admin skill** (`skill-admin/`) — comprehensive org admin reference covering user management, channel operations, user groups, invitations, custom emoji, linkifiers, and audit workflows
- **`zulip-audit.py`** bundled script — quick realm health checks (users, channels, subscription maps)
- README now documents both companion skills under "Install the Companion Skills"

## 2026.3.1 — Initial Release

### Features
- Native OpenClaw channel plugin (in-process, no external bridge)
- DM handling with session persistence
- Stream @mention detection with configurable chat modes (`oncall`, `onmessage`, `onchar`)
- Topic-based session threading (isolated context per stream+topic)
- Emoji reactions (add/remove via `message` tool)
- Pairing / allowlist access control (`dmPolicy`, `groupPolicy`)
- Auto-reconnection with exponential backoff
- Event queue re-registration on server-side expiry
- Multi-account support (multiple bots, different models)
- Interactive onboarding wizard (`openclaw setup`)
- Media/file upload support
- Hot-reload on config changes
- Health probe for `openclaw status`
- Zero external dependencies (uses OpenClaw's bundled zod + plugin-sdk)

### Architecture
- Modeled after `@openclaw/mattermost` plugin
- REST API + event queue long-poll (not WebSocket)
- 22 source files, ~2,800 lines of TypeScript
- Full OpenClaw plugin-sdk integration (pairing, session routing, reply dispatch, streaming)
