import { getZulipRuntime } from "../runtime.js";
import { resolveZulipAccount } from "./accounts.js";
import {
  createZulipClient,
  fetchZulipMe,
  normalizeZulipBaseUrl,
  uploadZulipFile,
  type ZulipUser,
} from "./client.js";

export type ZulipSendOpts = {
  botEmail?: string;
  botToken?: string;
  baseUrl?: string;
  accountId?: string;
  mediaUrl?: string;
  replyToId?: string;
  topic?: string;
};

export type ZulipSendResult = {
  messageId: string;
  streamId?: string;
  recipientId?: string;
};

type ZulipTarget =
  | { kind: "stream"; name: string; topic?: string }
  | { kind: "user"; id?: string; email?: string };

const botUserCache = new Map<string, ZulipUser>();
const userByEmailCache = new Map<string, ZulipUser>();

const getCore = () => getZulipRuntime();

function cacheKey(baseUrl: string, email: string): string {
  return `${baseUrl}::${email}`;
}

function normalizeMessage(text: string, mediaUrl?: string): string {
  const trimmed = text.trim();
  const media = mediaUrl?.trim();
  return [trimmed, media].filter(Boolean).join("\n");
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function parseZulipTarget(raw: string, opts?: ZulipSendOpts): ZulipTarget {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Recipient is required for Zulip sends");
  }

  const lower = trimmed.toLowerCase();

  // stream:<name> format
  if (lower.startsWith("stream:")) {
    const name = trimmed.slice("stream:".length).trim();
    if (!name) {
      throw new Error("Stream name is required for Zulip sends");
    }
    return { kind: "stream", name, topic: opts?.topic };
  }

  // #<name> format (stream)
  if (trimmed.startsWith("#")) {
    const name = trimmed.slice(1).trim();
    if (!name) {
      throw new Error("Stream name is required for Zulip sends");
    }
    return { kind: "stream", name, topic: opts?.topic };
  }

  // user:<id> format
  if (lower.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    if (!id) {
      throw new Error("User id is required for Zulip sends");
    }
    return { kind: "user", id };
  }

  // zulip:<id> format
  if (lower.startsWith("zulip:")) {
    const id = trimmed.slice("zulip:".length).trim();
    if (!id) {
      throw new Error("User id is required for Zulip sends");
    }
    return { kind: "user", id };
  }

  // @<email> format (user)
  if (trimmed.startsWith("@")) {
    const email = trimmed.slice(1).trim();
    if (!email) {
      throw new Error("User email is required for Zulip sends");
    }
    return { kind: "user", email };
  }

  // Bare string — try as stream name
  return { kind: "stream", name: trimmed, topic: opts?.topic };
}

async function resolveBotUser(baseUrl: string, email: string, token: string): Promise<ZulipUser> {
  const key = cacheKey(baseUrl, email);
  const cached = botUserCache.get(key);
  if (cached) {
    return cached;
  }

  const client = createZulipClient({ baseUrl, botEmail: email, botToken: token });
  const user = await fetchZulipMe(client);
  botUserCache.set(key, user);
  return user;
}

async function resolveUserIdByEmail(params: {
  baseUrl: string;
  email: string;
  token: string;
  targetEmail: string;
}): Promise<string> {
  const { baseUrl, email, token, targetEmail } = params;
  const key = `${cacheKey(baseUrl, email)}::${targetEmail.toLowerCase()}`;
  const cached = userByEmailCache.get(key);
  if (cached?.user_id) {
    return String(cached.user_id);
  }

  // Zulip doesn't have a direct email lookup endpoint in the basic API
  // We'll need to use the user_id directly or get it from events
  // For now, throw an error if we don't have the ID
  throw new Error(
    `Cannot resolve user ID from email "${targetEmail}". Please use user:<id> or zulip:<id> format instead.`,
  );
}

export async function sendMessageZulip(
  to: string,
  text: string,
  opts: ZulipSendOpts = {},
): Promise<ZulipSendResult> {
  const core = getCore();
  const logger = core.logging.getChildLogger({ module: "zulip" });
  const cfg = core.config.loadConfig();
  const account = resolveZulipAccount({
    cfg,
    accountId: opts.accountId,
  });

  const botEmail = opts.botEmail?.trim() || account.botEmail?.trim();
  const botToken = opts.botToken?.trim() || account.botToken?.trim();

  if (!botEmail) {
    throw new Error(
      `Zulip bot email missing for account "${account.accountId}" (set channels.zulip.accounts.${account.accountId}.botEmail or ZULIP_BOT_EMAIL for default).`,
    );
  }

  if (!botToken) {
    throw new Error(
      `Zulip bot token missing for account "${account.accountId}" (set channels.zulip.accounts.${account.accountId}.botToken or ZULIP_BOT_TOKEN for default).`,
    );
  }

  const baseUrl = normalizeZulipBaseUrl(opts.baseUrl ?? account.baseUrl);
  if (!baseUrl) {
    throw new Error(
      `Zulip baseUrl missing for account "${account.accountId}" (set channels.zulip.accounts.${account.accountId}.baseUrl or ZULIP_URL for default).`,
    );
  }

  const target = parseZulipTarget(to, opts);
  const client = createZulipClient({ baseUrl, botEmail, botToken });

  let message = text?.trim() ?? "";
  let uploadError: Error | undefined;
  const mediaUrl = opts.mediaUrl?.trim();

  if (mediaUrl) {
    try {
      const media = await core.media.loadWebMedia(mediaUrl);
      const fileInfo = await uploadZulipFile(client, {
        buffer: media.buffer,
        fileName: media.fileName ?? "upload",
        contentType: media.contentType ?? undefined,
      });
      // Embed as markdown link
      const fileName = media.fileName || "file";
      message = `${message}\n\n[${fileName}](${fileInfo.url})`.trim();
    } catch (err) {
      uploadError = err instanceof Error ? err : new Error(String(err));
      if (core.logging.shouldLogVerbose()) {
        logger.debug?.(
          `zulip send: media upload failed, falling back to URL text: ${String(err)}`,
        );
      }
      message = normalizeMessage(message, isHttpUrl(mediaUrl) ? mediaUrl : "");
    }
  }

  if (message) {
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "zulip",
      accountId: account.accountId,
    });
    message = core.channel.text.convertMarkdownTables(message, tableMode);
  }

  if (!message) {
    if (uploadError) {
      throw new Error(`Zulip media upload failed: ${uploadError.message}`);
    }
    throw new Error("Zulip message is empty");
  }

  let result: { id: number };

  if (target.kind === "stream") {
    // Stream message
    const topic = target.topic?.trim() || opts.topic?.trim() || "general";
    const body = new URLSearchParams({
      type: "stream",
      to: target.name,
      topic,
      content: message,
    });

    result = await client.request<{ id: number }>("/messages", {
      method: "POST",
      body: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    core.channel.activity.record({
      channel: "zulip",
      accountId: account.accountId,
      direction: "outbound",
    });

    return {
      messageId: String(result.id),
      streamId: target.name,
    };
  } else {
    // DM message
    const userId = target.id
      ? target.id
      : await resolveUserIdByEmail({
          baseUrl,
          email: botEmail,
          token: botToken,
          targetEmail: target.email ?? "",
        });

    const body = new URLSearchParams({
      type: "direct",
      to: JSON.stringify([Number(userId)]),
      content: message,
    });

    result = await client.request<{ id: number }>("/messages", {
      method: "POST",
      body: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    core.channel.activity.record({
      channel: "zulip",
      accountId: account.accountId,
      direction: "outbound",
    });

    return {
      messageId: String(result.id),
      recipientId: userId,
    };
  }
}
