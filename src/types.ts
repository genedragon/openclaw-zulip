import type { BlockStreamingCoalesceConfig, DmPolicy, GroupPolicy } from "openclaw/plugin-sdk";

export type ZulipChatMode = "oncall" | "onmessage" | "onchar";

export type ZulipAccountConfig = {
  /** Optional display name for this account (used in CLI/UI lists). */
  name?: string;
  /** Optional provider capability tags used for agent/runtime guidance. */
  capabilities?: string[];
  /**
   * Break-glass override: allow mutable identity matching (@username/display name) in allowlists.
   * Default behavior is ID-only matching.
   */
  dangerouslyAllowNameMatching?: boolean;
  /** Allow channel-initiated config writes (default: true). */
  configWrites?: boolean;
  /** If false, do not start this Zulip account. Default: true. */
  enabled?: boolean;
  /** Bot email for Zulip (e.g., opusBot-bot@host.com). */
  botEmail?: string;
  /** Bot API key for Zulip. */
  botToken?: string;
  /** Base URL for the Zulip server (e.g., https://zulip.example.com). */
  baseUrl?: string;
  /** Allow self-signed certificates (for testing). Default: false. */
  insecure?: boolean;
  /**
   * Controls when channel messages trigger replies.
   * - "oncall": only respond when mentioned
   * - "onmessage": respond to every channel message
   * - "onchar": respond when a trigger character prefixes the message
   */
  chatmode?: ZulipChatMode;
  /** Prefix characters that trigger onchar mode (default: [">", "!"]). */
  oncharPrefixes?: string[];
  /** Require @mention to respond in streams. Default: true. */
  requireMention?: boolean;
  /** Direct message policy (pairing/allowlist/open/disabled). */
  dmPolicy?: DmPolicy;
  /** Allowlist for direct messages (user ids or @usernames). */
  allowFrom?: Array<string | number>;
  /** Allowlist for group messages (user ids or @usernames). */
  groupAllowFrom?: Array<string | number>;
  /** Group message policy (allowlist/open/disabled). */
  groupPolicy?: GroupPolicy;
  /** Outbound text chunk size (chars). Default: 4000. */
  textChunkLimit?: number;
  /** Chunking mode: "length" (default) splits by size; "newline" splits on every newline. */
  chunkMode?: "length" | "newline";
  /** Disable block streaming for this account. */
  blockStreaming?: boolean;
  /** Merge streamed block replies before sending. */
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
  /** Outbound response prefix override for this channel/account. */
  responsePrefix?: string;
  /** Action toggles for this account. */
  actions?: {
    /** Enable message reaction actions. Default: true. */
    reactions?: boolean;
  };
};

export type ZulipConfig = {
  /** Optional per-account Zulip configuration (multi-account). */
  accounts?: Record<string, ZulipAccountConfig>;
} & ZulipAccountConfig;
