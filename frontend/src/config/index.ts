/**
 * Centralized Power Dialer & Telephony Configuration
 */

export const DEFAULT_UNANSWERED_TIMEOUT_SECONDS = 16;
export const HEARTBEAT_INTERVAL_MS = 3000;
export const STALE_TIMEOUT_MS = 15000;

export function getUnansweredTimeoutSeconds(): number {
  try {
    const saved = localStorage.getItem("dialer_unanswered_timeout");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
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
