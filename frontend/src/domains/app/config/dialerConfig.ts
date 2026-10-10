/**
 * Centralized Power Dialer & Telephony Configuration
 */

/**
 * How long a call rings before the dialer gives up and logs No answer,
 * counted from the first ring. 16s (counted from the INVITE) cut real calls
 * off after ~14s of ringing, before most businesses pick up (4-6 rings).
 */
export const DEFAULT_UNANSWERED_TIMEOUT_SECONDS = 30;
/** Never give up sooner than this, whatever is saved. */
export const MIN_UNANSWERED_TIMEOUT_SECONDS = 20;
/** The choices offered in Dialer settings. */
export const UNANSWERED_TIMEOUT_CHOICES = [20, 25, 30, 40, 50, 60];
/**
 * The claim heartbeat. Every 3s cost 40 of Twenty's 100 requests a minute;
 * every 10s, against a 45s stale window (STALE_TIMEOUT_MS in the backend),
 * still frees a crashed holder's number within a minute.
 */
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const STALE_TIMEOUT_MS = 45_000;

export function getUnansweredTimeoutSeconds(): number {
  try {
    const saved = localStorage.getItem("dialer_unanswered_timeout");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.max(MIN_UNANSWERED_TIMEOUT_SECONDS, parsed);
      }
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_UNANSWERED_TIMEOUT_SECONDS;
}

export function setUnansweredTimeoutSeconds(seconds: number): void {
  try {
    localStorage.setItem("dialer_unanswered_timeout", String(seconds));
  } catch {
    // localStorage unavailable
  }
}
