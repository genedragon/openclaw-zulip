export function normalizeZulipMessagingTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("stream:")) {
    const id = trimmed.slice("stream:".length).trim();
    return id ? `stream:${id}` : undefined;
  }
  if (lower.startsWith("topic:")) {
    const id = trimmed.slice("topic:".length).trim();
    return id ? `topic:${id}` : undefined;
  }
  if (lower.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    return id ? `user:${id}` : undefined;
  }
  if (lower.startsWith("zulip:")) {
    const id = trimmed.slice("zulip:".length).trim();
    return id ? `user:${id}` : undefined;
  }
  if (trimmed.startsWith("@")) {
    const id = trimmed.slice(1).trim();
    return id ? `@${id}` : undefined;
  }
  if (trimmed.startsWith("#")) {
    const id = trimmed.slice(1).trim();
    return id ? `stream:${id}` : undefined;
  }
  return `stream:${trimmed}`;
}

export function looksLikeZulipTargetId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(user|stream|topic|zulip):/i.test(trimmed)) {
    return true;
  }
  if (/^[@#]/.test(trimmed)) {
    return true;
  }
  return /^[a-z0-9]{1,}$/i.test(trimmed);
}
