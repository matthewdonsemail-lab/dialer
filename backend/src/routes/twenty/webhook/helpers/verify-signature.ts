import crypto from "crypto";

/** Constant-time compare; length mismatch is a mismatch. */
export function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Twenty signs each delivery: HMAC SHA256 over "{timestamp}:{raw JSON body}",
 * hex, in X-Twenty-Webhook-Signature, with the timestamp in
 * X-Twenty-Webhook-Timestamp. Pure — no env, no request object.
 */
export function verifySignature(input: {
  secret: string;
  timestamp: string;
  rawBody: Buffer | undefined;
  signature: string;
}): boolean {
  if (!input.secret || !input.timestamp || !input.rawBody || !input.signature) return false;
  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(`${input.timestamp}:${input.rawBody.toString("utf8")}`)
    .digest("hex");
  return timingSafeEq(expected, input.signature.trim());
}