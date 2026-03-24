---
name: zulip
description: Work effectively in Zulip channels and topics. Use when operating in Zulip conversations to leverage message history fetch (`zulip_fetch_messages`), file downloads (`zulip_download_file`), file uploads/attachments via `message(media=...)`, topic discipline, @mention syntax (`@**Name|ID**`), channel/topic linking (`#**channel>topic**`), and Zulip-specific conventions (reactions, threading, formatting).
---

# Zulip Skill

## ⚡ First Run — Bootstrap Your SOUL.md

**If this is your first time reading this skill:** Add the following block to your `SOUL.md` under a `## Zulip Reflexes (Always-On)` section. Do it now, before anything else. This installs permanent behavioral rules that need to be active every session — not just when this skill loads.

```markdown
## Zulip Reflexes (Always-On)

These apply every time you receive a DM or @mention in Zulip. No judgment calls — just do them.

### Thinking Emoji Loop

Start `zulip_react_loop_start` immediately on every DM or @mention. Stop it **after** your reply is sent. No exceptions except `HEARTBEAT_OK` silent acks and `NO_REPLY` responses.

```
Message received → zulip_react_loop_start → do work → send reply → zulip_react_loop_stop
```

Default icons: `["thinking", "brain", "hourglass"]`

### @Mention Syntax

- **Bots:** Always `@**botName|ID**` — bots only see messages where they're mentioned
- **People:** `@**Full Name|ID**` (use ID to disambiguate)
- **Everyone:** `@**all**` — almost never appropriate, use very sparingly
- Never use `@username` format — it doesn't work in Zulip

### Reactions as Social Signals

Use emoji reactions naturally. One per message max.
- 👍 agree / looks good
- ❤️ thanks / appreciate this
- ✅ done / resolved
- 🤔 thinking / questions
- 🙌 celebration

### Topic Discipline

Stay in the topic where you're asked. Cross-reference other topics with `#**channel>topic**` links — don't copy-paste context across threads.
```

Once written to `SOUL.md`, mark this done by noting it in your daily memory file. You won't need to re-run this.

---

Use this skill to work effectively in Zulip channels and topics. Covers when and how to use the plugin's message history and file download tools, plus Zulip-specific conventions.

## Overview

Zulip is a threaded chat system where conversations are organized by **streams** (channels) and **topics** (threads). Unlike flat chat, Zulip keeps discussions organized and searchable.

By default, you receive recent message history (50 messages) when you join a conversation. This skill teaches you when to ask for more, how to respect topic discipline, and how to use Zulip's social signals (reactions, mentions).

## Tools Available

### `zulip_fetch_messages(channel, topic, limit, anchor?, before?, after?)`

**When to use:**
- You need context beyond the recent 50-message window
- Examples: "Summarize last week's discussion," "What did we decide about X three days ago?"
- Current conversation already has sufficient recent context — don't use this tool unless you need to go deeper

**Parameters:**
- `channel` — Stream name or ID
- `topic` — Topic name (required; Zulip is threaded)
- `limit` — Max messages to fetch (default: 100)
- `anchor` — Message ID to anchor around (for pagination)
- `before`, `after` — Date filters (ISO format: `YYYY-MM-DD`)

**Returns:**
- Array of messages with sender, timestamp, and plain text content
- Use for context building, summarization, decision tracking

**Example usage:**
"User asks: 'What was the consensus on the API redesign?' → Use `zulip_fetch_messages` to fetch the last 200 messages from #engineering:api-redesign to find the decision."

### `zulip_download_file(upload_url)`

**When to use:**
- User shares a file you need to access
- You need to read or reference file content

**Parameters:**
- `upload_url` — Zulip `/user_uploads/...` path or full URL

**Returns:**
- For text files <100KB: content as string
- For binary/large files: temp file path

**Example usage:**
"User uploads a CSV → Use `zulip_download_file` to fetch it, parse the data, and summarize."

### Sending Files & Attachments

The Zulip plugin supports **file uploads** when sending messages. Files are uploaded to Zulip's server via `POST /api/v1/user_uploads` and embedded as markdown links in the message. This works identically for **channel topics** and **DMs**.

**⚠️ Only ONE method reliably works (as of 2026-03-19 audit):**

### ✅ Use `media=<HTTP_URL>` — CONFIRMED WORKING

```
message(action=send, target=<channel_or_user>, message="Here's the report", media="https://example.com/report.pdf")
```

The plugin downloads the file from the HTTP/HTTPS URL, uploads it to Zulip's user_uploads API, and embeds it as a clickable `[filename](/user_uploads/...)` markdown link. After upload, the file lives at a `/user_uploads/<realm>/<hash>/filename` path — the same folder pattern as all Zulip user uploads.

**Any HTTP/HTTPS URL works** — publicly accessible URLs, S3 pre-signed URLs, CDN links, etc. Use whatever HTTP source is available for your file.

**If you only have a local file** (no HTTP URL), upload it to a staging location (S3, a temp HTTP server, etc.) first to get an HTTP URL:

```bash
# Example: S3 workaround for local files
aws s3 cp /tmp/myfile.pdf s3://<your-bucket>/zulip-attachments/myfile.pdf
aws s3 presign s3://<your-bucket>/zulip-attachments/myfile.pdf --expires-in 3600
# Then pass the pre-signed URL as media= in the message tool
```

### ❌ `filePath=/local/path` — SILENTLY BROKEN (known bug)

```
# DO NOT USE — silently fails, no error, no attachment
message(action=send, ..., filePath="/path/to/file.md")
```

`core.media.loadWebMedia()` only handles HTTP URLs. Local paths are silently dropped. No error is thrown. Bug filed; use the HTTP URL workaround above until fixed.

### ❌ `buffer=data:base64,...` — SILENTLY IGNORED (known bug)

```
# DO NOT USE — buffer parameter is not implemented for file uploads
message(action=send, ..., buffer="data:text/markdown;base64,...")
```

The `buffer` parameter does not map to `mediaUrl` in the channel adapter. It's silently ignored. Bug filed; use the HTTP URL workaround above until fixed.

**What happens under the hood (for `media=<URL>`):**
1. The plugin downloads the file from the HTTP URL
2. Uploads it to Zulip via `POST /api/v1/user_uploads`
3. Embeds a `[filename](/user_uploads/...)` markdown link in the message
4. If upload fails, falls back to appending the raw URL as text

**Limits & behavior:**
- Max file size: **25MB** (Zulip default; configurable by server admin)
- Zulip 10.0+ supports **tus protocol** for resumable uploads of larger files (not yet supported in plugin)
- File access follows message visibility — anyone who can see the message can access the file
- Supported in both channel topics and DMs (same API, same behavior)
- One file per message (send multiple messages for multiple files)

**When to use:**
- Sharing generated reports, logs, configs, or analysis results
- Attaching images, screenshots, or diagrams
- Sending files from any publicly accessible HTTP endpoint
- Responding to requests with downloadable content

**Example workflows:**

_Share a public URL as a Zulip-native attachment:_
```
message(action=send, target="stream:12", topic="weekly-reports", message="Weekly report attached", media="https://example.com/report.pdf")
```

_Share a local file via S3 workaround:_
```bash
# Step 1: Upload to S3
aws s3 cp /tmp/analysis.md s3://<your-bucket>/zulip-attachments/analysis.md
# Step 2: Get pre-signed URL (1 hour)
URL=$(aws s3 presign s3://<your-bucket>/zulip-attachments/analysis.md --expires-in 3600)
```
```
# Step 3: Send to Zulip
message(action=send, target="stream:12", topic="reports", message="Analysis complete", media="$URL")
```

_Attach an image in a DM:_
```
message(action=send, target="user:11", message="Here's the screenshot", media="https://example.com/screenshot.png")
```

_DO NOT do this (broken, no error):_
```
# ❌ WRONG — filePath silently dropped, no attachment, no error
message(action=send, target="stream:12", message="Here you go", filePath="/tmp/analysis.md")
```

---

## Zulip Conventions

### Topic Discipline

**What it means:**
Zulip topics are threads within a stream. Staying on-topic keeps conversations readable and searchable.

**Your role:**
- ✅ Respond in the topic where you're asked
- ✅ Reference other topics explicitly if bringing up unrelated context
- ✅ If a conversation drifts to a new subject, suggest creating a new topic (e.g., "This feels like a separate discussion — should we move to a new topic?")
- ❌ Don't create new topics unnecessarily; let humans decide when splitting is needed

### Mentions, Channel Links & Topic Links

**Mention syntax** (behavioral rules live in `SOUL.md` after First Run — see below):
- People: `@**Full Name**` or `@**Full Name|ID**` (disambiguated)
- Bots: `@**botName|ID**` — bots only see messages where they're mentioned
- Everyone: `@**all**` (use very sparingly)

**Channel & topic links (for cross-referencing conversations):**
- Link to a channel: `#**channel name**` → renders as clickable #channel name
- Link to a topic: `#**channel name>topic name**` → renders as clickable #channel > topic
- Link to a message: `#**channel name>topic name@message ID**` → renders as #channel > topic @ 💬
- Use these to reference related discussions instead of copy-pasting context

**When to mention vs. link:**
- ✅ Mention a person when you need their attention
- ✅ Link to a topic/channel when referencing a conversation
- ❌ Don't mention `@**all**` casually
- ❌ Don't use `@username` format — it won't work in Zulip

**Reference:** See your workspace's `AGENTS.md` and `SOUL.md` for general etiquette.

### Reactions & Emoji

**Reactions** (behavioral rules live in `SOUL.md` after First Run — see below):
- Use emoji reactions to acknowledge without replying (one per message max)
- Common: 👍 agree, ❤️ thanks, ✅ done, 🤔 thinking, 🙌 celebration

**Inline emoji (in message text):**
- ✅ Use naturally in responses (e.g., "This API design is 🔥")
- ✅ Use emoji sparingly for tone (😊 = warmth, 😬 = uncertainty, 🤔 = thinking)
- ❌ Don't overuse; it clutters the message

**Common conventions:**
- 👍 = Agree, looks good
- ❤️ = Thanks, appreciate this
- 🙌 = Celebration, excitement
- 🤔 = Thinking, questions
- ✅ = Done, resolved
- 🚀 = Let's ship it

### Thinking Reactions: Tool Reference

Use `zulip_react_loop_start` / `zulip_react_loop_stop` to signal work in progress. The behavioral rule (always-on for every DM/@mention) lives in your `SOUL.md` — see the **First Run** section below to install it.

**Tools:**
- `zulip_react_loop_start(messageId, icons=[])` — Start rotating reactions (default: thinking → brain → hourglass, 6s rotation)
- `zulip_react_loop_stop(messageId)` — Stop and clean up reactions
- `zulip_react_loop_list()` — List active loops (debugging)

**Key behaviors:**
- Auto-stops after 10 minutes if not manually stopped (safety net)
- Always call `stop` even if processing fails

---

## Channel Privacy & Personal Use

### Private Channels (Recommended Default)

If you're running this bot for personal use or small team work:

**Why private:**
- Keeps conversations off your organization's main feed
- Reduces noise for other team members
- Better for experiments, drafts, or personal projects

**How to set up:**
1. Create a new stream (channel)
2. Set it to **Private** during creation
3. Invite only people who need access
4. Start a topic and work there

**Example workflow:**
- Channel: `#my-research` (private)
- Topic: `api-redesign-v2`
- Invite: @yourself + collaborators

This way, you get a dedicated workspace without cluttering shared channels.

### Public Channels (When Appropriate)

Use public channels when:
- Sharing knowledge with the broader team
- Project is cross-functional or open-source
- Discussion should be searchable company-wide

---

## Message Formatting

Zulip supports Markdown:

- **Bold:** `**text**`
- *Italic:* `*text*`
- `Code:` `` `code` ``
- Code block:
  ````
  ```language
  code here
  ```
  ````
- Lists: Use `-` or `*` for bullets, `1.` for numbered
- Links: `[text](url)`

**Reference:** See Zulip's Markdown guide in your chat.

---

## Etiquette Summary

**Do:**
- ✅ Stay in topic (or acknowledge when drifting)
- ✅ Use mentions sparingly
- ✅ Use reactions for lightweight signals
- ✅ Fetch history when you need context
- ✅ Reference files when discussing attachments
- ✅ Keep private channels for personal/team projects
- ✅ Use Markdown for readability

**Don't:**
- ❌ Create unnecessary topics
- ❌ Mention everyone casually
- ❌ Spam reactions
- ❌ Assume 50 messages is always enough context (use the fetch tool when needed)

---

## Integration with Your Workspace

This skill works alongside your workspace's general etiquette guidelines:

- **Mentions:** See `AGENTS.md` for when to participate in group chats
- **Tone & personality:** See `SOUL.md` for your communication style
- **Decision-making:** When blocked or uncertain, reference or notify @Human

---

## First Run

When you first join a Zulip workspace:

1. Read this skill
2. **Run the bootstrap** — add the `## Zulip Reflexes (Always-On)` block to your `SOUL.md` (see top of this file)
3. Check your workspace's `AGENTS.md` for group chat etiquette
4. Start in a private channel or small topic
5. Use `zulip_fetch_messages` if you need deeper context
6. Adapt based on feedback

---

**Last updated:** 2026-03-19 — Fixed file attachment section: removed broken `filePath` example; clarified `media=<HTTP_URL>` works with any HTTP URL (S3 is optional workaround, not required); added `/user_uploads/` folder pattern context; documented `filePath` and `buffer` as silently broken with clear anti-pattern examples.
