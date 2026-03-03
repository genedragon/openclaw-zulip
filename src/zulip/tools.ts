// Zulip Agent Tools — fetch history & download files
//
// These are registered via api.registerTool() in the plugin's index.ts
// so agents can call them like any other OpenClaw tool.

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import {
  createZulipClient,
  fetchZulipMessages,
  downloadZulipFile,
  type ZulipNarrow,
} from "./client.js";
import { resolveZulipAccount } from "./accounts.js";
import { getZulipRuntime } from "../runtime.js";

// Inline context type — matches OpenClawPluginToolContext but avoids
// importing a non-exported symbol from the SDK.
type ToolContext = {
  config?: unknown;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  messageChannel?: string;
  agentAccountId?: string;
  requesterSenderId?: string;
  senderIsOwner?: boolean;
  sandboxed?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Strip Zulip HTML to plain text.
 * Zulip returns HTML content by default; this produces clean readable text
 * when apply_markdown=false isn't sufficient or when HTML is already present.
 */
function stripHtmlToText(html: string): string {
  return html
    // Block-level elements → newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    // Inline code
    .replace(/<code>(.*?)<\/code>/gi, "`$1`")
    // Code blocks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n")
    // Bold
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    // Italic
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    // Links
    .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    // Mentions: <span class="user-mention" data-user-id="ID">@Name</span>
    .replace(/<span[^>]*class="user-mention"[^>]*>([^<]*)<\/span>/gi, "$1")
    // Images
    .replace(/<img[^>]+alt="([^"]*)"[^>]*>/gi, "[$1]")
    .replace(/<img[^>]+src="([^"]*)"[^>]*>/gi, "[image: $1]")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build a ZulipClient from the current plugin context.
 */
function buildClientFromContext(ctx: ToolContext) {
  const runtime = getZulipRuntime();
  const cfg = runtime.config.loadConfig();
  const accountId = ctx.agentAccountId ?? "default";
  const account = resolveZulipAccount({ cfg, accountId });

  const botEmail = account.botEmail?.trim();
  const botToken = account.botToken?.trim();
  const baseUrl = account.baseUrl?.trim();

  if (!botEmail || !botToken || !baseUrl) {
    throw new Error(
      `Zulip credentials not configured for account "${accountId}". ` +
      `Need botEmail, botToken, and baseUrl.`,
    );
  }

  return createZulipClient({
    baseUrl,
    botEmail,
    apiKey: botToken,
    insecure: account.insecure ?? false,
  });
}

// ── Tool: zulip_fetch_messages ───────────────────────────────────────

const fetchMessagesParams = Type.Object({
  channel: Type.Optional(
    Type.String({ description: "Channel/stream name or ID to fetch from" }),
  ),
  topic: Type.Optional(
    Type.String({ description: "Topic name within the channel" }),
  ),
  sender: Type.Optional(
    Type.String({ description: "Filter by sender email" }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Number of messages to fetch (default 20, max 100)",
      minimum: 1,
      maximum: 100,
    }),
  ),
  anchor: Type.Optional(
    Type.String({
      description:
        'Message ID or "newest"/"oldest" to anchor from (default "newest")',
    }),
  ),
  keyword: Type.Optional(
    Type.String({ description: "Search keyword to filter messages" }),
  ),
});

export function createFetchMessagesTool(): (ctx: ToolContext) => AnyAgentTool {
  return (ctx: ToolContext): AnyAgentTool => ({
    name: "zulip_fetch_messages",
    label: "Fetch Zulip Messages",
    description:
      "Fetch message history from a Zulip channel/topic. Use when you need more context " +
      "than the auto-injected recent messages (last ~50). Supports filtering by channel, " +
      "topic, sender, and keyword search.",
    parameters: fetchMessagesParams,
    async execute(_toolCallId, params) {
      const client = buildClientFromContext(ctx);

      // Build narrow filters
      const narrow: ZulipNarrow[] = [];
      if (params.channel) {
        // Zulip API uses "channel" operator for both name and ID
        narrow.push(["channel", params.channel]);
      }
      if (params.topic) {
        narrow.push(["topic", params.topic]);
      }
      if (params.sender) {
        narrow.push(["sender", params.sender]);
      }
      if (params.keyword) {
        narrow.push(["search", params.keyword]);
      }

      const limit = Math.min(params.limit ?? 20, 100);
      const anchor = params.anchor ?? "newest";

      const response = await fetchZulipMessages(client, {
        narrow,
        anchor,
        numBefore: anchor === "oldest" ? 0 : limit,
        numAfter: anchor === "oldest" ? limit : 0,
        applyMarkdown: false, // Get plain text, not HTML
      });

      if (!response.messages || response.messages.length === 0) {
        return {
          content: [{ type: "text", text: "No messages found matching the criteria." }],
          details: { count: 0 },
        };
      }

      // Format messages for the agent
      const formatted = response.messages.map((msg) => {
        const sender = msg.sender_full_name ?? msg.sender_email ?? `user:${msg.sender_id}`;
        const time = msg.timestamp
          ? new Date(msg.timestamp * 1000).toISOString()
          : "unknown";
        const stream =
          typeof msg.display_recipient === "string" ? msg.display_recipient : "";
        const topic = msg.subject ?? "";
        const body = msg.content?.includes("<") ? stripHtmlToText(msg.content) : msg.content;

        let header = `[${time}] ${sender}`;
        if (stream) header += ` in #${stream}`;
        if (topic) header += ` > ${topic}`;
        header += ` (id:${msg.id})`;

        return `${header}\n${body}`;
      });

      const summary =
        `Found ${response.messages.length} message(s)` +
        (response.found_oldest ? " (reached oldest)" : "") +
        (response.found_newest ? " (reached newest)" : "");

      return {
        content: [
          {
            type: "text",
            text: `${summary}\n\n${formatted.join("\n\n---\n\n")}`,
          },
        ],
        details: {
          count: response.messages.length,
          foundOldest: response.found_oldest,
          foundNewest: response.found_newest,
        },
      };
    },
  });
}

// ── Tool: zulip_download_file ────────────────────────────────────────

const downloadFileParams = Type.Object({
  url: Type.String({
    description:
      "Zulip file upload URL (e.g. /user_uploads/2/ab/cdef1234.png or full URL)",
  }),
});

export function createDownloadFileTool(): (ctx: ToolContext) => AnyAgentTool {
  return (ctx: ToolContext): AnyAgentTool => ({
    name: "zulip_download_file",
    label: "Download Zulip File",
    description:
      "Download a file uploaded to Zulip. Accepts /user_uploads/... paths or full Zulip URLs. " +
      "Returns file metadata (name, size, content type). For text files, returns the content. " +
      "For binary files, saves to a temp path.",
    parameters: downloadFileParams,
    async execute(_toolCallId, params) {
      const client = buildClientFromContext(ctx);
      const { buffer, contentType, fileName } = await downloadZulipFile(client, params.url);

      const isText =
        contentType.startsWith("text/") ||
        contentType.includes("json") ||
        contentType.includes("xml") ||
        contentType.includes("javascript") ||
        contentType.includes("yaml") ||
        contentType.includes("csv");

      if (isText && buffer.length < 100_000) {
        // Return text content directly
        return {
          content: [
            {
              type: "text",
              text:
                `File: ${fileName}\n` +
                `Type: ${contentType}\n` +
                `Size: ${buffer.length} bytes\n\n` +
                `--- Content ---\n${buffer.toString("utf-8")}`,
            },
          ],
          details: { fileName, contentType, size: buffer.length },
        };
      }

      // For binary/large files, save to temp and return path
      const tmpDir = process.env.TMPDIR ?? "/tmp";
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const tmpPath = `${tmpDir}/zulip-download-${Date.now()}-${safeName}`;

      const fs = await import("node:fs/promises");
      await fs.writeFile(tmpPath, buffer);

      return {
        content: [
          {
            type: "text",
            text:
              `File: ${fileName}\n` +
              `Type: ${contentType}\n` +
              `Size: ${buffer.length} bytes\n` +
              `Saved to: ${tmpPath}\n\n` +
              `(Binary file saved to disk. Use the file path to process it.)`,
          },
        ],
        details: { fileName, contentType, size: buffer.length, path: tmpPath },
      };
    },
  });
}
