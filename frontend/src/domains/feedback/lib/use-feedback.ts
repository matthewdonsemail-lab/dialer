import { useMemo } from "react";
import { useToast } from "@/components/ui/Toast";
import { describeError } from "../utils/describe-error";

/**
 * The wording every CRUD action uses, so toasts read the same everywhere:
 *
 *   done("Person added", "John Lally")          success: "<Thing> <past verb>"
 *   failed("Not saved", err)                    error:   "Not <verb>" + describeError(err)
 *   blocked("No free sending number", "...")    warning: the action could not start
 *
 * Failures that the person caused by choice (nothing selected, nothing left
 * to dial) are `blocked`, not `failed`: nothing went wrong.
 */
export function useFeedback() {
  const toast = useToast();
  return useMemo(
    () => ({
      done: (title: string, detail?: string) => toast.success(title, detail),
      failed: (title: string, err: unknown) => toast.error(title, describeError(err).detail),
      blocked: (title: string, detail?: string) => toast.warning(title, detail),
      info: (title: string, detail?: string) => toast.info(title, detail),
    }),
    [toast],
  );
}
