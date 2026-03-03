import type { BaseProbeResult } from "openclaw/plugin-sdk";
import { Agent as HttpsAgent } from "node:https";
import { normalizeZulipBaseUrl, readZulipError, type ZulipUser } from "./client.js";

export type ZulipProbe = BaseProbeResult & {
  status?: number | null;
  elapsedMs?: number | null;
  bot?: ZulipUser;
};

export async function probeZulip(
  baseUrl: string,
  botEmail: string,
  botToken: string,
  insecure: boolean = false,
  timeoutMs: number = 2500,
): Promise<ZulipProbe> {
  const normalized = normalizeZulipBaseUrl(baseUrl);
  if (!normalized) {
    return { ok: false, error: "baseUrl missing" };
  }
  if (!botEmail?.trim()) {
    return { ok: false, error: "botEmail missing" };
  }
  if (!botToken?.trim()) {
    return { ok: false, error: "botToken missing" };
  }

  if (insecure) {
    // Use per-request HTTPS agent instead of global NODE_TLS_REJECT_UNAUTHORIZED
  }
  const dispatcher = insecure
    ? new HttpsAgent({ rejectUnauthorized: false })
    : undefined;

  const url = `${normalized}/api/v1/users/me`;
  const start = Date.now();
  const controller = timeoutMs > 0 ? new AbortController() : undefined;
  let timer: NodeJS.Timeout | null = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const authString = Buffer.from(`${botEmail}:${botToken}`).toString("base64");
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${authString}` },
      signal: controller?.signal,
      // @ts-expect-error -- Node's fetch supports `dispatcher` for custom HTTPS agents
      dispatcher,
    });
    const elapsedMs = Date.now() - start;
    if (!res.ok) {
      const detail = await readZulipError(res);
      return { ok: false, status: res.status, error: detail || res.statusText, elapsedMs };
    }
    const bot = (await res.json()) as ZulipUser;
    return { ok: true, status: res.status, elapsedMs, bot };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, error: message, elapsedMs: Date.now() - start };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
