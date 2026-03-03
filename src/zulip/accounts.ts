import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { ZulipAccountConfig, ZulipChatMode } from "../types.js";
import { normalizeZulipBaseUrl } from "./client.js";

export type ZulipTokenSource = "env" | "config" | "none";
export type ZulipEmailSource = "env" | "config" | "none";
export type ZulipBaseUrlSource = "env" | "config" | "none";

export type ResolvedZulipAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  botEmail?: string;
  botToken?: string;
  baseUrl?: string;
  insecure?: boolean;
  botEmailSource: ZulipEmailSource;
  botTokenSource: ZulipTokenSource;
  baseUrlSource: ZulipBaseUrlSource;
  config: ZulipAccountConfig;
  chatmode?: ZulipChatMode;
  oncharPrefixes?: string[];
  requireMention?: boolean;
  textChunkLimit?: number;
  blockStreaming?: boolean;
  blockStreamingCoalesce?: ZulipAccountConfig["blockStreamingCoalesce"];
};

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = cfg.channels?.zulip?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

export function listZulipAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultZulipAccountId(cfg: OpenClawConfig): string {
  const ids = listZulipAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): ZulipAccountConfig | undefined {
  const accounts = cfg.channels?.zulip?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId] as ZulipAccountConfig | undefined;
}

function mergeZulipAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): ZulipAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.zulip ??
    {}) as ZulipAccountConfig & { accounts?: unknown };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

function resolveZulipRequireMention(config: ZulipAccountConfig): boolean | undefined {
  if (config.chatmode === "oncall") {
    return true;
  }
  if (config.chatmode === "onmessage") {
    return false;
  }
  if (config.chatmode === "onchar") {
    return true;
  }
  return config.requireMention;
}

export function resolveZulipAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedZulipAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = params.cfg.channels?.zulip?.enabled !== false;
  const merged = mergeZulipAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
  const envEmail = allowEnv ? process.env.ZULIP_BOT_EMAIL?.trim() : undefined;
  const envToken = allowEnv ? process.env.ZULIP_BOT_TOKEN?.trim() : undefined;
  const envUrl = allowEnv ? process.env.ZULIP_URL?.trim() : undefined;
  const configEmail = merged.botEmail?.trim();
  const configToken = merged.botToken?.trim();
  const configUrl = merged.baseUrl?.trim();
  const botEmail = configEmail || envEmail;
  const botToken = configToken || envToken;
  const baseUrl = normalizeZulipBaseUrl(configUrl || envUrl);
  const requireMention = resolveZulipRequireMention(merged);

  const botEmailSource: ZulipEmailSource = configEmail ? "config" : envEmail ? "env" : "none";
  const botTokenSource: ZulipTokenSource = configToken ? "config" : envToken ? "env" : "none";
  const baseUrlSource: ZulipBaseUrlSource = configUrl ? "config" : envUrl ? "env" : "none";

  return {
    accountId,
    enabled,
    name: merged.name?.trim() || undefined,
    botEmail,
    botToken,
    baseUrl,
    insecure: merged.insecure,
    botEmailSource,
    botTokenSource,
    baseUrlSource,
    config: merged,
    chatmode: merged.chatmode,
    oncharPrefixes: merged.oncharPrefixes,
    requireMention,
    textChunkLimit: merged.textChunkLimit,
    blockStreaming: merged.blockStreaming,
    blockStreamingCoalesce: merged.blockStreamingCoalesce,
  };
}

export function listEnabledZulipAccounts(cfg: OpenClawConfig): ResolvedZulipAccount[] {
  return listZulipAccountIds(cfg)
    .map((accountId) => resolveZulipAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
