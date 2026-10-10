import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api-client/api-error";
import { describeError } from "../utils/describe-error";
import { notify, subscribe } from "../lib/feedback-bus";

/**
 * The app-wide safety net for failures nobody handled:
 *   - events from outside React (query client) become toasts;
 *   - a promise that rejects with no handler (a forgotten await or .catch on
 *     an API call) becomes an error toast instead of vanishing into the
 *     console.
 * Expected failures are still handled where they happen, with their own
 * wording; this only catches what slipped through.
 */
export function FeedbackBridge() {
  const toast = useToast();

  useEffect(
    () =>
      subscribe((e) => {
        toast[e.variant](e.title, e.detail);
      }),
    [toast],
  );

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      // Only our own failures: browser-internal rejections (media play(),
      // aborted fetches) are not the user's business.
      if (!(reason instanceof ApiError)) return;
      console.error("Unhandled API failure", reason.path, reason);
      notify({ variant: "error", title: "Something did not save", detail: describeError(reason).detail });
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  return null;
}
