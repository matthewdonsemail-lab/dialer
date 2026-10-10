/**
 * A failed API call. `status` 0 means the request never got an answer
 * (offline, server down, CORS). `details` is the server's underlying reason
 * (often Twenty's), `code` a machine-readable kind such as
 * INVALID_TRANSITION or SMS_ROUTE_BLOCKED. Turn one into words with
 * describeError (@/domains/feedback).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: string | null = null,
    readonly code: string | null = null,
    readonly path: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
