import { resolveAllowlistMatchSimple, resolveEffectiveAllowFromLists } from "openclaw/plugin-sdk";

export function normalizeZulipAllowEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "*") {
    return "*";
  }
  return trimmed
    .replace(/^(zulip|user):/i, "")
    .replace(/^@/, "")
    .toLowerCase();
}

export function normalizeZulipAllowList(entries: Array<string | number>): string[] {
  const normalized = entries
    .map((entry) => normalizeZulipAllowEntry(String(entry)))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function resolveZulipEffectiveAllowFromLists(params: {
  allowFrom?: Array<string | number> | null;
  groupAllowFrom?: Array<string | number> | null;
  storeAllowFrom?: Array<string | number> | null;
  dmPolicy?: string | null;
}): {
  effectiveAllowFrom: string[];
  effectiveGroupAllowFrom: string[];
} {
  return resolveEffectiveAllowFromLists({
    allowFrom: normalizeZulipAllowList(params.allowFrom ?? []),
    groupAllowFrom: normalizeZulipAllowList(params.groupAllowFrom ?? []),
    storeAllowFrom: normalizeZulipAllowList(params.storeAllowFrom ?? []),
    dmPolicy: params.dmPolicy,
  });
}

export function isZulipSenderAllowed(params: {
  senderId: string;
  senderName?: string;
  allowFrom: string[];
  allowNameMatching?: boolean;
}): boolean {
  const allowFrom = normalizeZulipAllowList(params.allowFrom);
  if (allowFrom.length === 0) {
    return false;
  }
  const match = resolveAllowlistMatchSimple({
    allowFrom,
    senderId: normalizeZulipAllowEntry(params.senderId),
    senderName: params.senderName ? normalizeZulipAllowEntry(params.senderName) : undefined,
    allowNameMatching: params.allowNameMatching,
  });
  return match.allowed;
}
