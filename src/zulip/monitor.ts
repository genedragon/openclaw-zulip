import type {
  ChannelAccountSnapshot,
  ChatType,
  OpenClawConfig,
  ReplyPayload,
  RuntimeEnv,
} from "openclaw/plugin-sdk";
import {
  buildAgentMediaPayload,
  DM_GROUP_ACCESS_REASON,
  createScopedPairingAccess,
  createReplyPrefixOptions,
  createTypingCallbacks,
  logInboundDrop,
  logTypingFailure,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  DEFAULT_GROUP_HISTORY_LIMIT,
  recordPendingHistoryEntryIfEnabled,
  isDangerousNameMatchingEnabled,
  resolveControlCommandGate,
  readStoreAllowFromForDmPolicy,
  resolveDmGroupAccessWithLists,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  resolveChannelMediaMaxBytes,
  warnMissingProviderGroupPolicyFallbackOnce,
  type HistoryEntry,
} from "openclaw/plugin-sdk";
import { getZulipRuntime } from "../runtime.js";
import { resolveZulipAccount } from "./accounts.js";
import {
  createZulipClient,
  fetchZulipMe,
  fetchZulipUser,
  fetchZulipStream,
  normalizeZulipBaseUrl,
  registerZulipEventQueue,
  fetchZulipEvents,
  type ZulipClient,
  type ZulipMessage,
  type ZulipUser,
  type ZulipStream,
} from "./client.js";
import { isZulipSenderAllowed, normalizeZulipAllowList } from "./monitor-auth.js";
import {
  createDedupeCache,
  formatInboundFromLabel,
  resolveThreadSessionKeys,
} from "./monitor-helpers.js";
import { resolveOncharPrefixes, stripOncharPrefix } from "./monitor-onchar.js";
import { runWithReconnect } from "./reconnect.js";
import { sendMessageZulip } from "./send.js";
import { resolveZulipGroupRequireMention } from "../group-mentions.js";

export type MonitorZulipOpts = {
  botEmail?: string;
  botToken?: string;
  baseUrl?: string;
  insecure?: boolean;
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

const RECENT_ZULIP_MESSAGE_TTL_MS = 5 * 60_000;
const RECENT_ZULIP_MESSAGE_MAX = 2000;
const STREAM_CACHE_TTL_MS = 5 * 60_000;
const USER_CACHE_TTL_MS = 10 * 60_000;

const recentInboundMessages = createDedupeCache({
  ttlMs: RECENT_ZULIP_MESSAGE_TTL_MS,
  maxSize: RECENT_ZULIP_MESSAGE_MAX,
});

function resolveRuntime(opts: MonitorZulipOpts): RuntimeEnv {
  return (
    opts.runtime ?? {
      log: console.log,
      error: console.error,
      exit: (code: number): never => {
        throw new Error(`exit ${code}`);
      },
    }
  );
}

function normalizeMention(text: string, botName: string | undefined): string {
  if (!botName) {
    return text.trim();
  }
  // Zulip @mentions come as @**botName** in markdown
  const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@\\*\\*${escaped}\\*\\*`, "gi");
  return text.replace(re, " ").replace(/\s+/g, " ").trim();
}

function channelKind(messageType: string): ChatType {
  if (messageType === "private") {
    // Zulip uses "private" for DMs (1:1 or group)
    return "direct";
  }
  return "channel";
}

function channelChatType(kind: ChatType): "direct" | "group" | "channel" {
  if (kind === "direct") {
    return "direct";
  }
  if (kind === "group") {
    return "group";
  }
  return "channel";
}

export async function monitorZulipProvider(opts: MonitorZulipOpts = {}): Promise<void> {
  const core = getZulipRuntime();
  const runtime = resolveRuntime(opts);
  const cfg = opts.config ?? core.config.loadConfig();
  const account = resolveZulipAccount({
    cfg,
    accountId: opts.accountId,
  });
  const pairing = createScopedPairingAccess({
    core,
    channel: "zulip",
    accountId: account.accountId,
  });
  const allowNameMatching = isDangerousNameMatchingEnabled(account.config);
  const botEmail = opts.botEmail?.trim() || account.botEmail?.trim();
  if (!botEmail) {
    throw new Error(
      `Zulip bot email missing for account "${account.accountId}" (set channels.zulip.accounts.${account.accountId}.botEmail or ZULIP_BOT_EMAIL for default).`,
    );
  }
  const botToken = opts.botToken?.trim() || account.botToken?.trim();
  if (!botToken) {
    throw new Error(
      `Zulip API key missing for account "${account.accountId}" (set channels.zulip.accounts.${account.accountId}.botToken or ZULIP_BOT_TOKEN for default).`,
    );
  }
  const baseUrl = normalizeZulipBaseUrl(opts.baseUrl ?? account.baseUrl);
  if (!baseUrl) {
    throw new Error(
      `Zulip baseUrl missing for account "${account.accountId}" (set channels.zulip.accounts.${account.accountId}.baseUrl or ZULIP_URL for default).`,
    );
  }
  const insecure = opts.insecure ?? account.insecure ?? false;

  const client = createZulipClient({ baseUrl, botEmail, apiKey: botToken, insecure });
  const botUser = await fetchZulipMe(client);
  const botUserId = botUser.user_id;
  const botName = botUser.full_name?.trim() || undefined;
  runtime.log?.(`zulip connected as ${botName ? `${botName}` : `user ${botUserId}`}`);

  const streamCache = new Map<number, { value: ZulipStream | null; expiresAt: number }>();
  const userCache = new Map<number, { value: ZulipUser | null; expiresAt: number }>();
  const logger = core.logging.getChildLogger({ module: "zulip" });
  const logVerboseMessage = (message: string) => {
    if (!core.logging.shouldLogVerbose()) {
      return;
    }
    logger.debug?.(message);
  };
  const mediaMaxBytes =
    resolveChannelMediaMaxBytes({
      cfg,
      resolveChannelLimitMb: () => undefined,
      accountId: account.accountId,
    }) ?? 8 * 1024 * 1024;
  const historyLimit = Math.max(
    0,
    cfg.messages?.groupChat?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT,
  );
  const channelHistories = new Map<string, HistoryEntry[]>();
  const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
  const { groupPolicy, providerMissingFallbackApplied } =
    resolveAllowlistProviderRuntimeGroupPolicy({
      providerConfigPresent: cfg.channels?.zulip !== undefined,
      groupPolicy: account.config.groupPolicy,
      defaultGroupPolicy,
    });
  warnMissingProviderGroupPolicyFallbackOnce({
    providerMissingFallbackApplied,
    providerKey: "zulip",
    accountId: account.accountId,
    log: (message) => logVerboseMessage(message),
  });

  const resolveStreamInfo = async (streamId: number): Promise<ZulipStream | null> => {
    const cached = streamCache.get(streamId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    try {
      const info = await fetchZulipStream(client, streamId);
      streamCache.set(streamId, {
        value: info,
        expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
      });
      return info;
    } catch (err) {
      logger.debug?.(`zulip: stream lookup failed: ${String(err)}`);
      streamCache.set(streamId, {
        value: null,
        expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
      });
      return null;
    }
  };

  const resolveUserInfo = async (userId: number): Promise<ZulipUser | null> => {
    const cached = userCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    try {
      const info = await fetchZulipUser(client, userId);
      userCache.set(userId, {
        value: info,
        expiresAt: Date.now() + USER_CACHE_TTL_MS,
      });
      return info;
    } catch (err) {
      logger.debug?.(`zulip: user lookup failed: ${String(err)}`);
      userCache.set(userId, {
        value: null,
        expiresAt: Date.now() + USER_CACHE_TTL_MS,
      });
      return null;
    }
  };

  const handleMessage = async (message: ZulipMessage) => {
    const messageId = String(message.id);
    const senderId = String(message.sender_id);
    
    // Dedupe check
    if (recentInboundMessages.check(`${account.accountId}:${messageId}`)) {
      return;
    }

    // Skip own messages
    if (message.sender_id === botUserId) {
      return;
    }

    const kind = channelKind(message.type);
    const chatType = channelChatType(kind);
    const senderName = message.sender_full_name?.trim() || message.sender_email || senderId;
    const rawText = message.content?.trim() || "";

    // Determine stream/channel info
    let streamId: number | undefined;
    let streamName = "";
    let topicName = message.subject?.trim() || "";
    
    if (message.type === "stream") {
      streamId = message.stream_id;
      if (typeof message.display_recipient === "string") {
        streamName = message.display_recipient;
      }
      if (streamId) {
        const streamInfo = await resolveStreamInfo(streamId);
        if (streamInfo && !streamName) {
          streamName = streamInfo.name;
        }
      }
    }

    const channelId = message.type === "stream" ? String(streamId) : senderId;
    const dmPolicy = account.config.dmPolicy ?? "pairing";
    const normalizedAllowFrom = normalizeZulipAllowList(account.config.allowFrom ?? []);
    const normalizedGroupAllowFrom = normalizeZulipAllowList(
      account.config.groupAllowFrom ?? [],
    );
    const storeAllowFrom = normalizeZulipAllowList(
      await readStoreAllowFromForDmPolicy({
        provider: "zulip",
        accountId: account.accountId,
        dmPolicy,
        readStore: pairing.readStoreForDmPolicy,
      }),
    );
    const accessDecision = resolveDmGroupAccessWithLists({
      isGroup: kind !== "direct",
      dmPolicy,
      groupPolicy,
      allowFrom: normalizedAllowFrom,
      groupAllowFrom: normalizedGroupAllowFrom,
      storeAllowFrom,
      isSenderAllowed: (allowFrom) =>
        isZulipSenderAllowed({
          senderId,
          senderName,
          allowFrom,
          allowNameMatching,
        }),
    });
    const effectiveAllowFrom = accessDecision.effectiveAllowFrom;
    const effectiveGroupAllowFrom = accessDecision.effectiveGroupAllowFrom;
    const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
      cfg,
      surface: "zulip",
    });
    const hasControlCommand = core.channel.text.hasControlCommand(rawText, cfg);
    const isControlCommand = allowTextCommands && hasControlCommand;
    const useAccessGroups = cfg.commands?.useAccessGroups !== false;
    const commandDmAllowFrom = kind === "direct" ? effectiveAllowFrom : normalizedAllowFrom;
    const senderAllowedForCommands = isZulipSenderAllowed({
      senderId,
      senderName,
      allowFrom: commandDmAllowFrom,
      allowNameMatching,
    });
    const groupAllowedForCommands = isZulipSenderAllowed({
      senderId,
      senderName,
      allowFrom: effectiveGroupAllowFrom,
      allowNameMatching,
    });
    const commandGate = resolveControlCommandGate({
      useAccessGroups,
      authorizers: [
        { configured: commandDmAllowFrom.length > 0, allowed: senderAllowedForCommands },
        {
          configured: effectiveGroupAllowFrom.length > 0,
          allowed: groupAllowedForCommands,
        },
      ],
      allowTextCommands,
      hasControlCommand,
    });
    const commandAuthorized = commandGate.commandAuthorized;

    if (accessDecision.decision !== "allow") {
      if (kind === "direct") {
        if (accessDecision.reasonCode === DM_GROUP_ACCESS_REASON.DM_POLICY_DISABLED) {
          logVerboseMessage(`zulip: drop dm (dmPolicy=disabled sender=${senderId})`);
          return;
        }
        if (accessDecision.decision === "pairing") {
          const { code, created } = await pairing.upsertPairingRequest({
            id: senderId,
            meta: { name: senderName },
          });
          logVerboseMessage(`zulip: pairing request sender=${senderId} created=${created}`);
          if (created) {
            try {
              await sendMessageZulip(
                `user:${senderId}`,
                core.channel.pairing.buildPairingReply({
                  channel: "zulip",
                  idLine: `Your Zulip user id: ${senderId}`,
                  code,
                }),
                { accountId: account.accountId },
              );
              opts.statusSink?.({ lastOutboundAt: Date.now() });
            } catch (err) {
              logVerboseMessage(`zulip: pairing reply failed for ${senderId}: ${String(err)}`);
            }
          }
          return;
        }
        logVerboseMessage(`zulip: drop dm sender=${senderId} (dmPolicy=${dmPolicy})`);
        return;
      }
      if (accessDecision.reasonCode === DM_GROUP_ACCESS_REASON.GROUP_POLICY_DISABLED) {
        logVerboseMessage("zulip: drop group message (groupPolicy=disabled)");
        return;
      }
      if (accessDecision.reasonCode === DM_GROUP_ACCESS_REASON.GROUP_POLICY_EMPTY_ALLOWLIST) {
        logVerboseMessage("zulip: drop group message (no group allowlist)");
        return;
      }
      if (accessDecision.reasonCode === DM_GROUP_ACCESS_REASON.GROUP_POLICY_NOT_ALLOWLISTED) {
        logVerboseMessage(`zulip: drop group sender=${senderId} (not in groupAllowFrom)`);
        return;
      }
      logVerboseMessage(
        `zulip: drop group message (groupPolicy=${groupPolicy} reason=${accessDecision.reason})`,
      );
      return;
    }

    if (kind !== "direct" && commandGate.shouldBlock) {
      logInboundDrop({
        log: logVerboseMessage,
        channel: "zulip",
        reason: "control command (unauthorized)",
        target: senderId,
      });
      return;
    }

    const roomLabel = streamName ? `#${streamName}` : `#${channelId}`;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "zulip",
      accountId: account.accountId,
      peer: {
        kind,
        id: kind === "direct" ? senderId : channelId,
      },
    });

    const baseSessionKey = route.sessionKey;
    const threadId = message.type === "stream" && topicName ? topicName : undefined;
    const threadKeys = resolveThreadSessionKeys({
      baseSessionKey,
      threadId,
      parentSessionKey: threadId ? baseSessionKey : undefined,
    });
    const sessionKey = threadKeys.sessionKey;
    const historyKey = kind === "direct" ? null : sessionKey;

    const mentionRegexes = core.channel.mentions.buildMentionRegexes(cfg, route.agentId);
    // Zulip content is HTML; mentions appear as <span class="user-mention" data-user-id="ID">@Name</span>
    const htmlMentionedById = rawText.includes(`data-user-id="${botUserId}"`);
    // Zulip mentions: @**Name** or @**Name|ID** (disambiguated format from autocomplete)
    const markdownMentioned = botName
      ? (rawText.includes(`@**${botName}**`) || rawText.includes(`@**${botName}|`))
      : false;
    const wasMentioned =
      kind !== "direct" &&
      (htmlMentionedById || markdownMentioned ||
        core.channel.mentions.matchesMentionPatterns(rawText, mentionRegexes));
    runtime.log?.(`[MENTION-DEBUG] account=${account.accountId} botUserId=${botUserId} botName=${botName} htmlMatch=${htmlMentionedById} mdMatch=${markdownMentioned} wasMentioned=${wasMentioned} rawText=${rawText.substring(0, 100)}`);
    const pendingBody = rawText || "[Zulip message]";
    const pendingSender = senderName;
    const recordPendingHistory = () => {
      const trimmed = pendingBody.trim();
      recordPendingHistoryEntryIfEnabled({
        historyMap: channelHistories,
        limit: historyLimit,
        historyKey: historyKey ?? "",
        entry:
          historyKey && trimmed
            ? {
                sender: pendingSender,
                body: trimmed,
                timestamp: message.timestamp ? message.timestamp * 1000 : undefined,
                messageId,
              }
            : null,
      });
    };

    const oncharEnabled = account.chatmode === "onchar" && kind !== "direct";
    const oncharPrefixes = oncharEnabled ? resolveOncharPrefixes(account.oncharPrefixes) : [];
    const oncharResult = oncharEnabled
      ? stripOncharPrefix(rawText, oncharPrefixes)
      : { triggered: false, stripped: rawText };
    const oncharTriggered = oncharResult.triggered;

    const shouldRequireMention =
      kind !== "direct" &&
      resolveZulipGroupRequireMention({
        cfg,
        accountId: account.accountId,
        groupId: channelId,
      });
    const shouldBypassMention =
      isControlCommand && shouldRequireMention && !wasMentioned && commandAuthorized;
    const effectiveWasMentioned = wasMentioned || shouldBypassMention || oncharTriggered;
    const canDetectMention = Boolean(botName) || mentionRegexes.length > 0;

    if (oncharEnabled && !oncharTriggered && !wasMentioned && !isControlCommand) {
      recordPendingHistory();
      return;
    }

    if (kind !== "direct" && shouldRequireMention && canDetectMention) {
      if (!effectiveWasMentioned) {
        recordPendingHistory();
        return;
      }
    }

    const bodySource = oncharTriggered ? oncharResult.stripped : rawText;
    const bodyText = normalizeMention(bodySource, botName);
    if (!bodyText) {
      return;
    }

    core.channel.activity.record({
      channel: "zulip",
      accountId: account.accountId,
      direction: "inbound",
    });

    const fromLabel = formatInboundFromLabel({
      isGroup: kind !== "direct",
      groupLabel: roomLabel,
      groupId: channelId,
      groupFallback: roomLabel || "Channel",
      directLabel: senderName,
      directId: senderId,
    });

    const preview = bodyText.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel =
      kind === "direct"
        ? `Zulip DM from ${senderName}`
        : `Zulip message in ${roomLabel} from ${senderName}`;
    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey,
      contextKey: `zulip:message:${channelId}:${messageId}`,
    });

    const textWithId = topicName
      ? `${bodyText}\n[zulip message id: ${messageId} stream: ${streamName} topic: ${topicName}]`
      : `${bodyText}\n[zulip message id: ${messageId} channel: ${channelId}]`;
    const body = core.channel.reply.formatInboundEnvelope({
      channel: "Zulip",
      from: fromLabel,
      timestamp: message.timestamp ? message.timestamp * 1000 : undefined,
      body: textWithId,
      chatType,
      sender: { name: senderName, id: senderId },
    });
    let combinedBody = body;
    if (historyKey) {
      combinedBody = buildPendingHistoryContextFromMap({
        historyMap: channelHistories,
        historyKey,
        limit: historyLimit,
        currentMessage: combinedBody,
        formatEntry: (entry) =>
          core.channel.reply.formatInboundEnvelope({
            channel: "Zulip",
            from: fromLabel,
            timestamp: entry.timestamp,
            body: `${entry.body}${
              entry.messageId ? ` [id:${entry.messageId}]` : ""
            }`,
            chatType,
            senderLabel: entry.sender,
          }),
      });
    }

    const to = kind === "direct" ? `user:${senderId}` : streamId ? `stream:${streamId}` : `channel:${channelId}`;
    const mediaPayload = buildAgentMediaPayload([]);
    const inboundHistory =
      historyKey && historyLimit > 0
        ? (channelHistories.get(historyKey) ?? []).map((entry) => ({
            sender: entry.sender,
            body: entry.body,
            timestamp: entry.timestamp,
          }))
        : undefined;
    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: combinedBody,
      BodyForAgent: bodyText,
      InboundHistory: inboundHistory,
      RawBody: bodyText,
      CommandBody: bodyText,
      From:
        kind === "direct"
          ? `zulip:${senderId}`
          : `zulip:channel:${channelId}`,
      To: to,
      SessionKey: sessionKey,
      ParentSessionKey: threadKeys.parentSessionKey,
      AccountId: route.accountId,
      ChatType: chatType,
      ConversationLabel: fromLabel,
      GroupSubject: kind !== "direct" ? topicName || roomLabel : undefined,
      GroupChannel: streamName ? `#${streamName}` : undefined,
      GroupSpace: message.type === "stream" ? String(streamId) : undefined,
      SenderName: senderName,
      SenderId: senderId,
      Provider: "zulip" as const,
      Surface: "zulip" as const,
      MessageSid: messageId,
      MessageThreadId: threadId,
      Timestamp: message.timestamp ? message.timestamp * 1000 : undefined,
      WasMentioned: kind !== "direct" ? effectiveWasMentioned : undefined,
      CommandAuthorized: commandAuthorized,
      OriginatingChannel: "zulip" as const,
      OriginatingTo: to,
      ...mediaPayload,
    });

    if (kind === "direct") {
      const sessionCfg = cfg.session;
      const storePath = core.channel.session.resolveStorePath(sessionCfg?.store, {
        agentId: route.agentId,
      });
      await core.channel.session.updateLastRoute({
        storePath,
        sessionKey: route.mainSessionKey,
        deliveryContext: {
          channel: "zulip",
          to,
          accountId: route.accountId,
        },
      });
    }

    const previewLine = bodyText.slice(0, 200).replace(/\n/g, "\\n");
    logVerboseMessage(
      `zulip inbound: from=${ctxPayload.From} len=${bodyText.length} preview="${previewLine}"`,
    );

    const textLimit = core.channel.text.resolveTextChunkLimit(
      cfg,
      "zulip",
      account.accountId,
      {
        fallbackLimit: account.textChunkLimit ?? 4000,
      },
    );
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "zulip",
      accountId: account.accountId,
    });

    const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
      cfg,
      agentId: route.agentId,
      channel: "zulip",
      accountId: account.accountId,
    });

    const typingCallbacks = createTypingCallbacks({
      start: async () => {
        // Zulip doesn't have a typing indicator API
      },
      onStartError: (err) => {
        logTypingFailure({
          log: (message) => logger.debug?.(message),
          channel: "zulip",
          target: channelId,
          error: err,
        });
      },
    });
    const { dispatcher, replyOptions, markDispatchIdle } =
      core.channel.reply.createReplyDispatcherWithTyping({
        ...prefixOptions,
        humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
        typingCallbacks,
        deliver: async (payload: ReplyPayload) => {
          const text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);
          const chunkMode = core.channel.text.resolveChunkMode(
            cfg,
            "zulip",
            account.accountId,
          );
          const chunks = core.channel.text.chunkMarkdownTextWithMode(text, textLimit, chunkMode);
          for (const chunk of chunks.length > 0 ? chunks : [text]) {
            if (!chunk) {
              continue;
            }
            await sendMessageZulip(to, chunk, {
              accountId: account.accountId,
              topic: topicName,
            });
          }
          runtime.log?.(`delivered reply to ${to}`);
        },
        onError: (err, info) => {
          runtime.error?.(`zulip ${info.kind} reply failed: ${String(err)}`);
        },
      });

    await core.channel.reply.withReplyDispatcher({
      dispatcher,
      onSettled: () => {
        markDispatchIdle();
      },
      run: () =>
        core.channel.reply.dispatchReplyFromConfig({
          ctx: ctxPayload,
          cfg,
          dispatcher,
          replyOptions: {
            ...replyOptions,
            disableBlockStreaming:
              typeof account.blockStreaming === "boolean" ? !account.blockStreaming : undefined,
            onModelSelected,
          },
        }),
    });
    if (historyKey) {
      clearHistoryEntriesIfEnabled({
        historyMap: channelHistories,
        historyKey,
        limit: historyLimit,
      });
    }
  };

  const handleReactionEvent = async (event: any) => {
    const userId = event.user_id;
    const messageId = event.message_id;
    const emojiName = event.emoji_name;
    const isRemoved = event.op === "remove";
    
    if (!userId || !messageId || !emojiName) {
      return;
    }

    if (userId === botUserId) {
      return;
    }

    const action = isRemoved ? "removed" : "added";
    const senderInfo = await resolveUserInfo(userId);
    const senderName = senderInfo?.full_name?.trim() || String(userId);

    const eventText = `Zulip reaction ${action}: :${emojiName}: by ${senderName} on message ${messageId}`;
    logVerboseMessage(eventText);
    // For now, just log reactions. We can add full reaction handling later.
  };

  const connectOnce = async () => {
    // Register event queue
    const queue = await registerZulipEventQueue(client, {
      eventTypes: ["message", "reaction"],
      allPublicStreams: true,
    });
    
    let queueId = queue.queue_id;
    let lastEventId = queue.last_event_id;
    
    opts.statusSink?.({ connected: true });
    runtime.log?.(`zulip: event queue registered (queue_id=${queueId})`);

    // Event polling loop
    while (!opts.abortSignal?.aborted) {
      try {
        const response = await fetchZulipEvents(client, {
          queueId,
          lastEventId,
        });

        for (const event of response.events) {
          if (event.type === "message" && event.message) {
            await handleMessage(event.message);
          } else if (event.type === "reaction") {
            await handleReactionEvent(event);
          } else if (event.type === "heartbeat") {
            logVerboseMessage("zulip: heartbeat received");
          }
          lastEventId = event.id;
        }
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes("BAD_EVENT_QUEUE_ID")) {
          runtime.log?.("zulip: event queue expired, re-registering");
          const newQueue = await registerZulipEventQueue(client, {
            eventTypes: ["message", "reaction"],
            allPublicStreams: true,
          });
          queueId = newQueue.queue_id;
          lastEventId = newQueue.last_event_id;
          opts.statusSink?.({ connected: true });
        } else {
          throw err;
        }
      }
    }
  };

  await runWithReconnect(connectOnce, {
    abortSignal: opts.abortSignal,
    jitterRatio: 0.2,
    onError: (err) => {
      runtime.error?.(`zulip connection failed: ${String(err)}`);
      opts.statusSink?.({ lastError: String(err), connected: false });
    },
    onReconnect: (delayMs) => {
      runtime.log?.(`zulip reconnecting in ${Math.round(delayMs / 1000)}s`);
    },
  });
}
