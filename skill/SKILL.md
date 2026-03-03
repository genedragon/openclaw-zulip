---
name: zulip
description: Work effectively in Zulip channels and topics. Use when operating in Zulip conversations to leverage message history fetch (`zulip_fetch_messages`), file downloads (`zulip_download_file`), topic discipline, @mention syntax (`@**Name|ID**`), channel/topic linking (`#**channel>topic**`), and Zulip-specific conventions (reactions, threading, formatting).
---

# Zulip Skill

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

**Mention syntax (Zulip-specific — not like Slack/Discord):**
- People: `@**Full Name**` or `@**Full Name|ID**` (disambiguated)
- Bots: **always** use `@**botName|ID**` — bots only see messages where they're mentioned
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

**Reactions (API-driven emoji on messages):**
- ✅ Use lightweight reactions to acknowledge without replying (👍 = agreement, ❤️ = appreciation, 🙌 = celebration)
- ✅ One reaction per message max
- ❌ Don't spam multiple reactions on the same message

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
  ```
  ```language
  code here
  ```
  ```
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
2. Check your workspace's `AGENTS.md` for group chat etiquette
3. Start in a private channel or small topic
4. Use `zulip_fetch_messages` if you need deeper context
5. Adapt based on feedback

---

**Last updated:** 2026-03-02 23:15 UTC
