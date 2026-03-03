import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { resolveZulipAccount } from "./accounts.js";
import { createZulipClient, fetchZulipMe, type ZulipClient } from "./client.js";

type Result = { ok: true } | { ok: false; error: string };
type ReactionParams = {
  cfg: OpenClawConfig;
  messageId: string;
  emojiName: string;
  accountId?: string | null;
  fetchImpl?: typeof fetch;
};
type ReactionMutation = (client: ZulipClient, params: MutationPayload) => Promise<void>;
type MutationPayload = { messageId: string; emojiName: string };

const BOT_USER_CACHE_TTL_MS = 10 * 60_000;
const botUserIdCache = new Map<string, { userId: string; expiresAt: number }>();

async function resolveBotUserId(
  client: ZulipClient,
  cacheKey: string,
): Promise<string | null> {
  const cached = botUserIdCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }
  const me = await fetchZulipMe(client);
  const userId = String(me?.user_id);
  if (!userId) {
    return null;
  }
  botUserIdCache.set(cacheKey, { userId, expiresAt: Date.now() + BOT_USER_CACHE_TTL_MS });
  return userId;
}

export async function addZulipReaction(params: {
  cfg: OpenClawConfig;
  messageId: string;
  emojiName: string;
  accountId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Result> {
  return runZulipReaction(params, {
    action: "add",
    mutation: createReaction,
  });
}

export async function removeZulipReaction(params: {
  cfg: OpenClawConfig;
  messageId: string;
  emojiName: string;
  accountId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Result> {
  return runZulipReaction(params, {
    action: "remove",
    mutation: deleteReaction,
  });
}

export function resetZulipReactionBotUserCacheForTests(): void {
  botUserIdCache.clear();
}

async function runZulipReaction(
  params: ReactionParams,
  options: {
    action: "add" | "remove";
    mutation: ReactionMutation;
  },
): Promise<Result> {
  const resolved = resolveZulipAccount({ cfg: params.cfg, accountId: params.accountId });
  const baseUrl = resolved.baseUrl?.trim();
  const botEmail = resolved.botEmail?.trim();
  const botToken = resolved.botToken?.trim();

  if (!baseUrl || !botEmail || !botToken) {
    return { ok: false, error: "Zulip botEmail/botToken/baseUrl missing." };
  }

  const client = createZulipClient({
    baseUrl,
    botEmail,
    botToken,
    fetchImpl: params.fetchImpl,
  });

  const cacheKey = `${baseUrl}:${botEmail}:${botToken}`;
  const userId = await resolveBotUserId(client, cacheKey);
  if (!userId) {
    return { ok: false, error: "Zulip reactions failed: could not resolve bot user id." };
  }

  try {
    await options.mutation(client, {
      messageId: params.messageId,
      emojiName: params.emojiName,
    });
  } catch (err) {
    return { ok: false, error: `Zulip ${options.action} reaction failed: ${String(err)}` };
  }

  return { ok: true };
}

async function createReaction(client: ZulipClient, params: MutationPayload): Promise<void> {
  const body = new URLSearchParams({
    emoji_name: params.emojiName,
  });

  await client.request<Record<string, unknown>>(`/messages/${params.messageId}/reactions`, {
    method: "POST",
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

async function deleteReaction(client: ZulipClient, params: MutationPayload): Promise<void> {
  const body = new URLSearchParams({
    emoji_name: params.emojiName,
  });

  await client.request<unknown>(`/messages/${params.messageId}/reactions`, {
    method: "DELETE",
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}
