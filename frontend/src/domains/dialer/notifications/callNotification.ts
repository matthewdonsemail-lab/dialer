let activeNotification: Notification | null = null;

export interface CallNotificationOptions {
  callerName?: string;
  callerNumber?: string;
  onClick?: () => void;
}

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

export function showCallNotification(options: CallNotificationOptions): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== "granted") return null;

  dismissCallNotification();

  const title = `Incoming Call: ${options.callerName || options.callerNumber || "Unknown"}`;
  const body = options.callerNumber && options.callerName && options.callerName !== options.callerNumber
    ? `${options.callerNumber} is calling you.`
    : "Incoming call on the dialer.";

  try {
    const notification = new Notification(title, {
      body,
      icon: "/favicon.ico",
      requireInteraction: true,
      tag: "incoming-call",
    });

    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignored
      }
      options.onClick?.();
      notification.close();
    };

    activeNotification = notification;
    return notification;
  } catch {
    return null;
  }
}

export function dismissCallNotification(): void {
  if (activeNotification) {
    try {
      activeNotification.close();
    } catch {
      // Ignored
    }
    activeNotification = null;
  }
}
