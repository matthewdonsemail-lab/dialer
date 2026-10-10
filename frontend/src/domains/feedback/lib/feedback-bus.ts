/**
 * Toasts from outside React (the query client, global error listeners).
 * FeedbackBridge, mounted inside ToastProvider, turns these into toasts.
 */
export interface FeedbackEvent {
  variant: "success" | "error" | "warning" | "info";
  title: string;
  detail?: string;
}

type Listener = (event: FeedbackEvent) => void;
const listeners = new Set<Listener>();
const queue: FeedbackEvent[] = [];

export function notify(event: FeedbackEvent): void {
  if (listeners.size === 0) {
    // Nothing mounted yet (startup): keep it until the bridge subscribes.
    queue.push(event);
    return;
  }
  listeners.forEach((l) => l(event));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  queue.splice(0).forEach(listener);
  return () => {
    listeners.delete(listener);
  };
}
