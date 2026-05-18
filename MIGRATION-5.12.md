# Migration Guide: OpenClaw 2026.5.12

This document covers required changes when upgrading from OpenClaw ≤2026.4.x to 2026.5.12.

## Breaking Changes

### 1. Plugin SDK Path Change

The `browser-support` subpath was removed from the plugin SDK. If your extension imports from it:

```diff
- export { rawDataToString } from "openclaw/plugin-sdk/browser-support";
+ export { rawDataToString } from "openclaw/plugin-sdk/gateway-runtime";
```

`rawDataToString` is now exported from both `gateway-runtime` and `webhook-ingress`.

### 2. Channel Auto-Delivery Requires Opt-In

OpenClaw 5.12 defaults to `message_tool_only` for group/channel messages as a safety measure. Bots will process messages but won't auto-post responses unless you explicitly enable it.

**Required config** in `~/.openclaw/openclaw.json`:
```json
{
  "messages": {
    "visibleReplies": "automatic"
  }
}
```

Without this, agents will show "Delivery: to send a message, use the message tool" in the web UI and responses won't appear in Zulip streams.

### 3. Group Policy Enforcement

`groupPolicy: "allowlist"` is now strictly enforced. If your accounts use `groupPolicy: "allowlist"` without a `groupAllowFrom` list, the bot will not deliver responses to streams.

**Fix**: Either set `groupPolicy: "open"` on each account, or add explicit `groupAllowFrom` entries:
```json
{
  "channels": {
    "zulip": {
      "accounts": {
        "default": {
          "groupPolicy": "open"
        }
      }
    }
  }
}
```

### 4. Plugin Manifest: `contracts.tools`

OpenClaw 5.12 requires plugins to declare their tools in `openclaw.plugin.json` before registering them at runtime. Without this, you'll see:

```
[gateway] [plugins] plugin must declare contracts.tools before registering agent tools
```

This is handled in this repo's `openclaw.plugin.json`.

### 5. Externalized Plugins

Amazon Bedrock and Brave Search were externalized from the OpenClaw core in 5.12. Install them separately:

```bash
openclaw plugins install @openclaw/amazon-bedrock-provider
openclaw plugins install @openclaw/brave-plugin
```

## Recommended Upgrade Steps

1. Back up config: `cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak`
2. Stop the gateway: `systemctl --user stop openclaw-gateway.service`
3. Upgrade OpenClaw: `sudo npm install -g openclaw@2026.5.12`
4. Install externalized plugins (if used):
   ```bash
   openclaw plugins install @openclaw/amazon-bedrock-provider
   openclaw plugins install @openclaw/brave-plugin
   ```
5. Update the Zulip extension to this branch
6. Add `"messages": {"visibleReplies": "automatic"}` to config
7. Set `groupPolicy: "open"` on accounts that should reply in streams
8. Start the gateway: `systemctl --user start openclaw-gateway.service`
9. Verify: `journalctl --user -u openclaw-gateway.service --since "1 minute ago" | grep -i error`
