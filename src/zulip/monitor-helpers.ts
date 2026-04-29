import { formatInboundFromLabel as formatInboundFromLabelShared } from "openclaw/plugin-sdk/channel-inbound";
import { resolveThreadSessionKeys as resolveThreadSessionKeysShared } from "openclaw/plugin-sdk/core";
export { rawDataToString } from "openclaw/plugin-sdk/browser-support";
export { createDedupeCache } from "openclaw/plugin-sdk/core";

export const formatInboundFromLabel = formatInboundFromLabelShared;

export function resolveThreadSessionKeys(params: {
  baseSessionKey: string;
  threadId?: string | null;
  parentSessionKey?: string;
  useSuffix?: boolean;
}): { sessionKey: string; parentSessionKey?: string } {
  return resolveThreadSessionKeysShared({
    ...params,
    normalizeThreadId: (threadId) => threadId,
  });
}
