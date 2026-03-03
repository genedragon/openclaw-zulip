import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  setAccountEnabledInConfigSection,
  type ChannelMessageActionAdapter,
  type ChannelMessageActionName,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import { ZulipConfigSchema } from "./config-schema.js";
import { resolveZulipGroupRequireMention } from "./group-mentions.js";
import {
  listZulipAccountIds,
  resolveDefaultZulipAccountId,
  resolveZulipAccount,
  type ResolvedZulipAccount,
} from "./zulip/accounts.js";
import { normalizeZulipBaseUrl } from "./zulip/client.js";
import { monitorZulipProvider } from "./zulip/monitor.js";
import { probeZulip } from "./zulip/probe.js";
import { addZulipReaction, removeZulipReaction } from "./zulip/reactions.js";
import { sendMessageZulip } from "./zulip/send.js";
import { looksLikeZulipTargetId, normalizeZulipMessagingTarget } from "./normalize.js";
import { zulipOnboardingAdapter } from "./onboarding.js";
import { getZulipRuntime } from "./runtime.js";

const zulipMessageActions: ChannelMessageActionAdapter = {
  listActions: ({ cfg }) => {
    const actionsConfig = cfg.channels?.zulip?.actions as { reactions?: boolean } | undefined;
    const baseReactions = actionsConfig?.reactions;
    const hasReactionCapableAccount = listZulipAccountIds(cfg)
      .map((accountId) => resolveZulipAccount({ cfg, accountId }))
      .filter((account) => account.enabled)
      .filter((account) => Boolean(account.botEmail?.trim() && account.botToken?.trim() && account.baseUrl?.trim()))
      .some((account) => {
        const accountActions = account.config.actions as { reactions?: boolean } | undefined;
        return (accountActions?.reactions ?? baseReactions ?? true) !== false;
      });

    if (!hasReactionCapableAccount) {
      return [];
    }

    return ["react"];
  },
  supportsAction: ({ action }) => {
    return action === "react";
  },
  handleAction: async ({ action, params, cfg, accountId }) => {
    if (action !== "react") {
      throw new Error(`Zulip action ${action} not supported`);
    }
    // Check reactions gate: per-account config takes precedence over base config
    const zulipBase = cfg?.channels?.zulip as Record<string, unknown> | undefined;
    const accounts = zulipBase?.accounts as Record<string, Record<string, unknown>> | undefined;
    const resolvedAccountId = accountId ?? resolveDefaultZulipAccountId(cfg);
    const acctConfig = accounts?.[resolvedAccountId];
    const acctActions = acctConfig?.actions as { reactions?: boolean } | undefined;
    const baseActions = zulipBase?.actions as { reactions?: boolean } | undefined;
    const reactionsEnabled = acctActions?.reactions ?? baseActions?.reactions ?? true;
    if (!reactionsEnabled) {
      throw new Error("Zulip reactions are disabled in config");
    }

    const messageIdRaw =
      typeof (params as any)?.messageId === "string"
        ? (params as any).messageId
        : "";
    const messageId = messageIdRaw.trim();
    if (!messageId) {
      throw new Error("Zulip react requires messageId");
    }

    const emojiRaw = typeof (params as any)?.emoji === "string" ? (params as any).emoji : "";
    const emojiName = emojiRaw.trim().replace(/^:+|:+$/g, "");
    if (!emojiName) {
      throw new Error("Zulip react requires emoji");
    }

    const remove = (params as any)?.remove === true;
    if (remove) {
      const result = await removeZulipReaction({
        cfg,
        messageId,
        emojiName,
        accountId: resolvedAccountId,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return {
        content: [
          { type: "text" as const, text: `Removed reaction :${emojiName}: from ${messageId}` },
        ],
        details: {},
      };
    }

    const result = await addZulipReaction({
      cfg,
      messageId,
      emojiName,
      accountId: resolvedAccountId,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }

    return {
      content: [{ type: "text" as const, text: `Reacted with :${emojiName}: on ${messageId}` }],
      details: {},
    };
  },
};

const meta = {
  id: "zulip",
  label: "Zulip",
  selectionLabel: "Zulip (plugin)",
  detailLabel: "Zulip Bot",
  docsPath: "/channels/zulip",
  docsLabel: "zulip",
  blurb: "open-source team chat with threaded topics; install the plugin to enable.",
  systemImage: "bubble.left.and.bubble.right",
  order: 66,
  quickstartAllowFrom: true,
} as const;

function normalizeAllowEntry(entry: string): string {
  return entry
    .trim()
    .replace(/^(zulip|user):/i, "")
    .replace(/^@/, "")
    .toLowerCase();
}

function formatAllowEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("@")) {
    const username = trimmed.slice(1).trim();
    return username ? `@${username.toLowerCase()}` : "";
  }
  return trimmed.replace(/^(zulip|user):/i, "").toLowerCase();
}

export const zulipPlugin: ChannelPlugin<ResolvedZulipAccount> = {
  id: "zulip",
  meta: {
    ...meta,
  },
  onboarding: zulipOnboardingAdapter,
  pairing: {
    idLabel: "zulipUserId",
    normalizeAllowEntry: (entry) => normalizeAllowEntry(entry),
    notifyApproval: async ({ id }) => {
      console.log(`[zulip] User ${id} approved for pairing`);
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel", "group", "thread"],
    reactions: true,
    threads: true,
    media: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.zulip"] },
  configSchema: buildChannelConfigSchema(ZulipConfigSchema),
  config: {
    listAccountIds: (cfg) => listZulipAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveZulipAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultZulipAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "zulip",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "zulip",
        accountId,
        clearBaseFields: ["botEmail", "botToken", "baseUrl", "name"],
      }),
    isConfigured: (account) => Boolean(account.botEmail && account.botToken && account.baseUrl),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.botEmail && account.botToken && account.baseUrl),
      botEmailSource: account.botEmailSource,
      botTokenSource: account.botTokenSource,
      baseUrl: account.baseUrl,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveZulipAccount({ cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => formatAllowEntry(String(entry))).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.zulip?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.zulip.accounts.${resolvedAccountId}.`
        : "channels.zulip.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("zulip"),
        normalizeEntry: (raw) => normalizeAllowEntry(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
      const { groupPolicy } = resolveAllowlistProviderRuntimeGroupPolicy({
        providerConfigPresent: cfg.channels?.zulip !== undefined,
        groupPolicy: account.config.groupPolicy,
        defaultGroupPolicy,
      });
      if (groupPolicy !== "open") {
        return [];
      }
      return [
        `- Zulip streams: groupPolicy="open" allows any member to trigger (mention-gated). Set channels.zulip.groupPolicy="allowlist" + channels.zulip.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  groups: {
    resolveRequireMention: resolveZulipGroupRequireMention,
  },
  actions: zulipMessageActions,
  messaging: {
    normalizeTarget: normalizeZulipMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeZulipTargetId,
      hint: "<streamName|user:ID|stream:NAME|topic:NAME>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getZulipRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: new Error(
            "Delivering to Zulip requires --to <streamName|@username|user:ID|stream:NAME>",
          ),
        };
      }
      return { ok: true, to: trimmed };
    },
    sendText: async ({ to, text, accountId, replyToId, threadId }) => {
      const topic = threadId != null ? String(threadId) : undefined;
      const result = await sendMessageZulip(to, text, {
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? undefined,
        topic,
      });
      return { channel: "zulip", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, replyToId, threadId }) => {
      const topic = threadId != null ? String(threadId) : undefined;
      const result = await sendMessageZulip(to, text, {
        accountId: accountId ?? undefined,
        mediaUrl,
        replyToId: replyToId ?? undefined,
        topic,
      });
      return { channel: "zulip", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      botEmailSource: snapshot.botEmailSource ?? "none",
      botTokenSource: snapshot.botTokenSource ?? "none",
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      baseUrl: snapshot.baseUrl ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) => {
      const email = account.botEmail?.trim();
      const token = account.botToken?.trim();
      const baseUrl = account.baseUrl?.trim();
      if (!email || !token || !baseUrl) {
        return { ok: false, error: "bot email, token, or baseUrl missing" };
      }
      return await probeZulip(baseUrl, email, token, account.insecure ?? false, timeoutMs);
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.botEmail && account.botToken && account.baseUrl),
      botEmailSource: account.botEmailSource,
      botTokenSource: account.botTokenSource,
      baseUrl: account.baseUrl,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastDisconnect: runtime?.lastDisconnect ?? null,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "zulip",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "Zulip env vars can only be used for the default account.";
      }
      const email = input.botEmail ?? input.email;
      const token = input.botToken ?? input.token;
      const baseUrl = input.httpUrl;
      if (!input.useEnv && (!email || !token || !baseUrl)) {
        return "Zulip requires --bot-email, --bot-token, and --http-url (or --use-env).";
      }
      if (baseUrl && !normalizeZulipBaseUrl(baseUrl)) {
        return "Zulip --http-url must include a valid base URL.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const email = input.botEmail ?? input.email;
      const token = input.botToken ?? input.token;
      const baseUrl = input.httpUrl?.trim();
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "zulip",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "zulip",
            })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            zulip: {
              ...next.channels?.zulip,
              enabled: true,
              ...(input.useEnv
                ? {}
                : {
                    ...(email ? { botEmail: email } : {}),
                    ...(token ? { botToken: token } : {}),
                    ...(baseUrl ? { baseUrl } : {}),
                  }),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          zulip: {
            ...next.channels?.zulip,
            enabled: true,
            accounts: {
              ...next.channels?.zulip?.accounts,
              [accountId]: {
                ...next.channels?.zulip?.accounts?.[accountId],
                enabled: true,
                ...(email ? { botEmail: email } : {}),
                ...(token ? { botToken: token } : {}),
                ...(baseUrl ? { baseUrl } : {}),
              },
            },
          },
        },
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        baseUrl: account.baseUrl,
        botEmailSource: account.botEmailSource,
        botTokenSource: account.botTokenSource,
      });
      ctx.log?.info(`[${account.accountId}] starting channel`);
      return monitorZulipProvider({
        botEmail: account.botEmail ?? undefined,
        botToken: account.botToken ?? undefined,
        baseUrl: account.baseUrl ?? undefined,
        insecure: account.insecure ?? false,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
  },
};
