// Zulip Thinking Reaction Loops
//
// Manages rotating emoji reactions to indicate ongoing work.
// Auto-cleanup after TTL to prevent orphaned reactions.

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { addZulipReaction, removeZulipReaction } from "./reactions.js";

const DEFAULT_ICONS = ["thinking", "brain", "hourglass"];
const DEFAULT_INTERVAL_MS = 6000; // 6 seconds
const DEFAULT_TTL_MS = 10 * 60_000; // 10 minutes
const MAX_ACTIVE_LOOPS = 15; // Stay well under rate limits

interface ActiveLoop {
  messageId: string;
  icons: string[];
  currentIndex: number;
  intervalHandle: NodeJS.Timeout;
  ttlHandle: NodeJS.Timeout;
  cfg: OpenClawConfig;
  accountId?: string | null;
  startedAt: number;
}

// Global registry of active loops
const activeLoops = new Map<string, ActiveLoop>();

/**
 * Start a rotating emoji reaction loop on a Zulip message.
 * 
 * @param messageId - Zulip message ID to react to
 * @param icons - Array of emoji names to rotate through (default: ["thinking", "brain", "hourglass"])
 * @param cfg - OpenClaw config for Zulip auth
 * @param accountId - Optional Zulip account ID
 * @returns Loop ID (same as messageId) or error
 */
export async function startReactionLoop(params: {
  messageId: string;
  icons?: string[];
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<{ ok: true; loopId: string } | { ok: false; error: string }> {
  const { messageId, cfg, accountId } = params;
  const icons = params.icons && params.icons.length > 0 ? params.icons : DEFAULT_ICONS;

  // Check if loop already exists for this message
  if (activeLoops.has(messageId)) {
    return { ok: false, error: `Reaction loop already running for message ${messageId}` };
  }

  // Enforce rate limit safety
  if (activeLoops.size >= MAX_ACTIVE_LOOPS) {
    return {
      ok: false,
      error: `Max active loops (${MAX_ACTIVE_LOOPS}) reached. Stop some loops first.`,
    };
  }

  // Add initial reaction
  let currentIndex = 0;
  const addResult = await addZulipReaction({
    cfg,
    messageId,
    emojiName: icons[currentIndex],
    accountId,
  });

  if (!addResult.ok) {
    return { ok: false, error: `Failed to start loop: ${addResult.error}` };
  }

  // Set up rotation interval
  const intervalHandle = setInterval(async () => {
    const loop = activeLoops.get(messageId);
    if (!loop) {
      // Loop was stopped externally, clear interval
      clearInterval(intervalHandle);
      return;
    }

    const previousIndex = loop.currentIndex;
    const nextIndex = (previousIndex + 1) % loop.icons.length;

    // Add new reaction
    await addZulipReaction({
      cfg: loop.cfg,
      messageId: loop.messageId,
      emojiName: loop.icons[nextIndex],
      accountId: loop.accountId,
    });

    // Remove previous reaction
    await removeZulipReaction({
      cfg: loop.cfg,
      messageId: loop.messageId,
      emojiName: loop.icons[previousIndex],
      accountId: loop.accountId,
    });

    // Update index
    loop.currentIndex = nextIndex;
  }, DEFAULT_INTERVAL_MS);

  // Set up TTL auto-stop
  const ttlHandle = setTimeout(() => {
    stopReactionLoop({ messageId });
  }, DEFAULT_TTL_MS);

  // Register loop
  activeLoops.set(messageId, {
    messageId,
    icons,
    currentIndex,
    intervalHandle,
    ttlHandle,
    cfg,
    accountId,
    startedAt: Date.now(),
  });

  return { ok: true, loopId: messageId };
}

/**
 * Stop a rotating emoji reaction loop and clean up.
 * Removes only the last rotating emoji added by the loop.
 * 
 * @param messageId - Zulip message ID (loop ID)
 * @returns Success or error
 */
export async function stopReactionLoop(params: {
  messageId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { messageId } = params;
  const loop = activeLoops.get(messageId);

  if (!loop) {
    return { ok: false, error: `No active loop found for message ${messageId}` };
  }

  // Clear timers
  clearInterval(loop.intervalHandle);
  clearTimeout(loop.ttlHandle);

  // Remove final reaction
  const removeResult = await removeZulipReaction({
    cfg: loop.cfg,
    messageId: loop.messageId,
    emojiName: loop.icons[loop.currentIndex],
    accountId: loop.accountId,
  });

  // Remove from registry regardless of API result
  activeLoops.delete(messageId);

  if (!removeResult.ok) {
    return { ok: false, error: `Loop stopped but cleanup failed: ${removeResult.error}` };
  }

  return { ok: true };
}

/**
 * List all currently active reaction loops.
 */
export function listActiveLoops(): Array<{
  messageId: string;
  icons: string[];
  currentEmoji: string;
  startedAt: number;
  runningFor: number;
}> {
  return Array.from(activeLoops.values()).map((loop) => ({
    messageId: loop.messageId,
    icons: loop.icons,
    currentEmoji: loop.icons[loop.currentIndex],
    startedAt: loop.startedAt,
    runningFor: Date.now() - loop.startedAt,
  }));
}

/**
 * Stop all active loops (for cleanup on shutdown).
 */
export async function stopAllLoops(): Promise<void> {
  const promises = Array.from(activeLoops.keys()).map((messageId) =>
    stopReactionLoop({ messageId }),
  );
  await Promise.allSettled(promises);
}

// Clean up on process exit
process.on("SIGTERM", () => {
  stopAllLoops().catch(console.error);
});

process.on("SIGINT", () => {
  stopAllLoops().catch(console.error);
});

// For testing: reset state
export function resetLoopsForTests(): void {
  activeLoops.clear();
}
