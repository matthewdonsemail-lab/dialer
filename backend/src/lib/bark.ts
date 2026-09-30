import { createLogger } from "./logger.js";

const log = createLogger("bark");

export interface BarkPushOptions {
  title?: string;
  subtitle?: string;
  body: string;
  group?: string;
  url?: string;
  level?: "active" | "timeSensitive" | "passive" | "critical";
  sound?: string;
  badge?: number;
  icon?: string;
}

export interface BarkPushResult {
  ok: boolean;
  status: number;
  message: string;
}

/**
 * Bark server base URL.
 *
 * Defaults to the public Bark server (https://api.day.app).
 * Override with BARK_SERVER_URL when self-hosting (e.g. a custom
 * domain on node01 behind auth-guard). Trailing slashes are stripped.
 *
 * Docs: https://bark.day.app/#/en-us/tutorial
 * API v2: POST {server}/push { device_key, title, body, ... }
 */
export function getBarkServerUrl(): string {
  const raw = (process.env.BARK_SERVER_URL || "https://api.day.app").trim();
  return raw.replace(/\/+$/, "");
}

function redactKey(key: string): string {
  if (!key) return "(empty)";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Send a push notification through a Bark server.
 *
 * The device key is the per-member BARK_KEY stored on the
 * workspaceMember object in Twenty (field `barkKey`, label BARK_KEY,
 * type RICH_TEXT -> markdown string). The key itself never gets logged
 * beyond a redacted prefix/suffix.
 */
export async function sendBarkPush(
  deviceKey: string,
  options: BarkPushOptions,
): Promise<BarkPushResult> {
  const key = (deviceKey || "").trim();
  if (!key) {
    throw new Error("Bark device key is required");
  }
  const body = (options.body || "").trim();
  if (!body) {
    throw new Error("Bark notification body is required");
  }

  const server = getBarkServerUrl();
  const url = `${server}/push`;

  const payload: Record<string, unknown> = {
    device_key: key,
    body,
  };
  if (options.title?.trim()) payload.title = options.title.trim();
  if (options.subtitle?.trim()) payload.subtitle = options.subtitle.trim();
  if (options.group?.trim()) payload.group = options.group.trim();
  if (options.url?.trim()) payload.url = options.url.trim();
  if (options.level) payload.level = options.level;
  if (options.sound?.trim()) payload.sound = options.sound.trim();
  if (typeof options.badge === "number") payload.badge = options.badge;
  if (options.icon?.trim()) payload.icon = options.icon.trim();

  log.info(`Bark push via ${server} key=${redactKey(key)} title=${String(payload.title || "").slice(0, 80)}`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let message = text.slice(0, 500);
  try {
    const json = JSON.parse(text) as { code?: number; message?: string };
    message = json.message || message;
    if (response.ok && json.code !== undefined && json.code !== 200) {
      return { ok: false, status: response.status, message };
    }
  } catch {
    // Non-JSON body — keep truncated text as the message.
  }

  if (!response.ok) {
    log.error(`Bark push failed: ${response.status} ${message}`);
    return { ok: false, status: response.status, message };
  }

  log.info(`Bark push accepted: ${response.status} ${message}`);
  return { ok: true, status: response.status, message };
}
