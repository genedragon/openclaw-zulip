// Zulip REST API Client
// Uses HTTP Basic Auth (email:apiKey) and event queue long-polling

import { Agent as HttpsAgent } from "node:https";

export type ZulipClient = {
  baseUrl: string;
  apiBaseUrl: string;
  botEmail: string;
  apiKey: string;
  authHeader: string;
  insecure: boolean;
  dispatcher?: HttpsAgent;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};

export type ZulipUser = {
  user_id: number;
  email?: string | null;
  full_name?: string | null;
  is_bot?: boolean;
  bot_type?: number | null;
};

export type ZulipStream = {
  stream_id: number;
  name: string;
  description?: string | null;
};

export type ZulipMessage = {
  id: number;
  sender_id: number;
  sender_email?: string | null;
  sender_full_name?: string | null;
  type: "stream" | "private";
  stream_id?: number;
  display_recipient: string | Array<{ id: number; email: string; full_name?: string }>;
  subject: string; // Topic name
  content: string; // HTML content
  timestamp: number;
};

export type ZulipEventQueue = {
  queue_id: string;
  last_event_id: number;
  event_queue_longpoll_timeout_seconds?: number;
};

export type ZulipEvent = {
  id: number;
  type: string;
  op?: string;
  message?: ZulipMessage;
  user_id?: number;
  message_id?: number;
  emoji_name?: string;
  emoji_code?: string;
};

export type ZulipEventsResponse = {
  result: string;
  events: ZulipEvent[];
};

export type ZulipFileUpload = {
  url: string;
};

export function normalizeZulipBaseUrl(raw?: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  const withoutTrailing = trimmed.replace(/\/+$/, "");
  return withoutTrailing.replace(/\/api\/v1$/i, "");
}

function buildZulipApiUrl(baseUrl: string, path: string): string {
  const normalized = normalizeZulipBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error("Zulip baseUrl is required");
  }
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${normalized}/api/v1${suffix}`;
}

export async function readZulipError(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await res.json()) as { msg?: string; code?: string; result?: string } | undefined;
    if (data?.msg) {
      return data.code ? `${data.code}: ${data.msg}` : data.msg;
    }
    return JSON.stringify(data);
  }
  return await res.text();
}

export function createZulipClient(params: {
  baseUrl: string;
  botEmail: string;
  botToken?: string;
  apiKey?: string;
  insecure?: boolean;
  fetchImpl?: typeof fetch;
}): ZulipClient {
  const baseUrl = normalizeZulipBaseUrl(params.baseUrl);
  if (!baseUrl) {
    throw new Error("Zulip baseUrl is required");
  }
  const apiBaseUrl = `${baseUrl}/api/v1`;
  const botEmail = params.botEmail.trim();
  const apiKey = (params.apiKey ?? params.botToken ?? "").trim();
  if (!apiKey) {
    throw new Error("Zulip API key (botToken) is required");
  }
  const authHeader = `Basic ${Buffer.from(`${botEmail}:${apiKey}`).toString("base64")}`;
  const insecure = params.insecure ?? false;
  const fetchImpl = params.fetchImpl ?? fetch;

  // Use a per-client HTTPS agent for insecure mode instead of the global
  // NODE_TLS_REJECT_UNAUTHORIZED env var (which would affect ALL connections).
  const dispatcher = insecure
    ? new HttpsAgent({ rejectUnauthorized: false })
    : undefined;

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const url = buildZulipApiUrl(baseUrl, path);
    const headers = new Headers(init?.headers);
    headers.set("Authorization", authHeader);
    if (typeof init?.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
    }
    // @ts-expect-error -- Node's fetch supports `dispatcher` for custom HTTPS agents
    const res = await fetchImpl(url, { ...init, headers, dispatcher });
    if (!res.ok) {
      const detail = await readZulipError(res);
      throw new Error(
        `Zulip API ${res.status} ${res.statusText}: ${detail || "unknown error"}`,
      );
    }
    if (res.status === 204) {
      return undefined as T;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await res.json()) as { result?: string; msg?: string; code?: string } & T;
      if (json.result === "error") {
        throw new Error(
          `Zulip API error: ${json.code ? `${json.code}: ` : ""}${json.msg || "unknown error"}`,
        );
      }
      return json as T;
    }
    return (await res.text()) as T;
  };

  return { baseUrl, apiBaseUrl, botEmail, apiKey, authHeader, insecure, dispatcher, request };
}

export async function fetchZulipMe(client: ZulipClient): Promise<ZulipUser> {
  return await client.request<ZulipUser>("/users/me");
}

export async function fetchZulipUser(client: ZulipClient, userId: number): Promise<ZulipUser> {
  const response = await client.request<{ user: ZulipUser }>(`/users/${userId}`);
  return response.user;
}

export async function fetchZulipStream(client: ZulipClient, streamId: number): Promise<ZulipStream> {
  const response = await client.request<{ stream: ZulipStream }>(`/streams/${streamId}`);
  return response.stream;
}

export async function registerZulipEventQueue(
  client: ZulipClient,
  params: {
    eventTypes?: string[];
    allPublicStreams?: boolean;
    narrow?: Array<string[]>;
  },
): Promise<ZulipEventQueue> {
  const body = new URLSearchParams();
  if (params.eventTypes) {
    body.set("event_types", JSON.stringify(params.eventTypes));
  }
  if (params.allPublicStreams) {
    body.set("all_public_streams", "true");
  }
  if (params.narrow) {
    body.set("narrow", JSON.stringify(params.narrow));
  }
  return await client.request<ZulipEventQueue>("/register", {
    method: "POST",
    body: body.toString(),
  });
}

export async function fetchZulipEvents(
  client: ZulipClient,
  params: {
    queueId: string;
    lastEventId: number;
    dontBlock?: boolean;
  },
): Promise<ZulipEventsResponse> {
  const queryParams = new URLSearchParams({
    queue_id: params.queueId,
    last_event_id: String(params.lastEventId),
  });
  if (params.dontBlock) {
    queryParams.set("dont_block", "true");
  }
  return await client.request<ZulipEventsResponse>(`/events?${queryParams.toString()}`);
}

export async function sendZulipMessage(
  client: ZulipClient,
  params: {
    type: "stream" | "direct";
    to: string | number[];
    topic?: string;
    content: string;
  },
): Promise<{ id: number }> {
  const body = new URLSearchParams({
    type: params.type,
    to: typeof params.to === "string" ? params.to : JSON.stringify(params.to),
    content: params.content,
  });
  if (params.topic) {
    body.set("topic", params.topic);
  }
  return await client.request<{ id: number }>("/messages", {
    method: "POST",
    body: body.toString(),
  });
}

export async function uploadZulipFile(
  client: ZulipClient,
  params: {
    buffer: Buffer;
    fileName: string;
    contentType?: string;
  },
): Promise<ZulipFileUpload> {
  const form = new FormData();
  const bytes = Uint8Array.from(params.buffer);
  const blob = params.contentType
    ? new Blob([bytes], { type: params.contentType })
    : new Blob([bytes]);
  form.append("file", blob, params.fileName);

  const res = await fetch(`${client.apiBaseUrl}/user_uploads`, {
    method: "POST",
    headers: { Authorization: client.authHeader },
    body: form,
    // @ts-expect-error -- Node's fetch supports `dispatcher` for custom HTTPS agents
    dispatcher: client.dispatcher,
  });
  if (!res.ok) {
    const detail = await readZulipError(res);
    throw new Error(`Zulip API ${res.status} ${res.statusText}: ${detail || "unknown error"}`);
  }
  const data = (await res.json()) as { uri?: string; url?: string };
  const url = data.uri || data.url;
  if (!url) {
    throw new Error("Zulip file upload failed: no URL returned");
  }
  const absoluteUrl = url.startsWith("/") ? `${client.baseUrl}${url}` : url;
  return { url: absoluteUrl };
}

export async function addZulipMessageReaction(
  client: ZulipClient,
  messageId: number,
  emojiName: string,
): Promise<void> {
  const body = new URLSearchParams({ emoji_name: emojiName });
  await client.request<Record<string, unknown>>(`/messages/${messageId}/reactions`, {
    method: "POST",
    body: body.toString(),
  });
}

export async function removeZulipMessageReaction(
  client: ZulipClient,
  messageId: number,
  emojiName: string,
): Promise<void> {
  const body = new URLSearchParams({ emoji_name: emojiName });
  await client.request<Record<string, unknown>>(`/messages/${messageId}/reactions`, {
    method: "DELETE",
    body: body.toString(),
  });
}

// ── History & File Access ────────────────────────────────────────────

export type ZulipNarrow = [string, string];

export type ZulipFetchMessagesParams = {
  narrow: ZulipNarrow[];
  anchor?: string | number; // "newest", "oldest", "first_unread", or message ID
  numBefore?: number;
  numAfter?: number;
  applyMarkdown?: boolean;
};

export type ZulipFetchMessagesResponse = {
  messages: ZulipMessage[];
  found_anchor?: boolean;
  found_oldest?: boolean;
  found_newest?: boolean;
};

/**
 * Fetch messages from the Zulip server using the GET /messages endpoint.
 * Supports narrow filtering by stream, topic, sender, etc.
 */
export async function fetchZulipMessages(
  client: ZulipClient,
  params: ZulipFetchMessagesParams,
): Promise<ZulipFetchMessagesResponse> {
  const query = new URLSearchParams();
  query.set("narrow", JSON.stringify(params.narrow));
  query.set("anchor", String(params.anchor ?? "newest"));
  query.set("num_before", String(params.numBefore ?? 20));
  query.set("num_after", String(params.numAfter ?? 0));
  // Request plain-text content (no HTML) for easier agent consumption
  query.set("apply_markdown", String(params.applyMarkdown ?? false));
  return await client.request<ZulipFetchMessagesResponse>(`/messages?${query.toString()}`);
}

/**
 * Download a file from Zulip's /user_uploads/ path using bot credentials.
 * Returns the raw response body as a Buffer and the content type.
 */
export async function downloadZulipFile(
  client: ZulipClient,
  uploadPath: string,
): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  // Normalize: accept full URLs or relative /user_uploads/... paths
  let path = uploadPath.trim();
  if (path.startsWith("http")) {
    try {
      const url = new URL(path);
      path = url.pathname;
    } catch {
      // If URL parsing fails, try using as-is
    }
  }
  // Ensure path starts with /
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  const url = `${client.baseUrl}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: client.authHeader },
    redirect: "follow",
    // @ts-expect-error -- Node's fetch supports `dispatcher` for custom HTTPS agents
    dispatcher: client.dispatcher,
  });

  if (!res.ok) {
    const detail = await readZulipError(res);
    throw new Error(`Zulip file download ${res.status}: ${detail || "unknown error"}`);
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Extract filename from path or content-disposition
  const disposition = res.headers.get("content-disposition") ?? "";
  let fileName = "";
  const filenameMatch = disposition.match(/filename[*]?=(?:UTF-8''|"?)([^";\n]+)/i);
  if (filenameMatch) {
    fileName = decodeURIComponent(filenameMatch[1].trim());
  } else {
    // Fall back to last segment of the path
    const segments = path.split("/").filter(Boolean);
    fileName = segments[segments.length - 1] ?? "download";
  }

  return { buffer, contentType, fileName };
}
