/**
 * A Twenty PHONES composite (or a plain string) as E.164. Twenty stores the
 * national number in primaryPhoneNumber and the calling code separately
 * ("353" or "+353"), so the number alone is not dialable. Pure.
 */
export function toE164(
  phone: { primaryPhoneNumber?: string | null; primaryPhoneCallingCode?: string | null } | string | null | undefined,
): string | null {
  if (!phone) return null;
  if (typeof phone === "string") {
    const raw = phone.trim();
    if (!raw) return null;
    return raw.startsWith("+") ? `+${raw.slice(1).replace(/\D/g, "")}` : raw.replace(/[^\d]/g, "") || null;
  }
  const num = String(phone.primaryPhoneNumber ?? "").trim();
  if (!num) return null;
  if (num.startsWith("+")) return `+${num.slice(1).replace(/\D/g, "")}`;
  const code = String(phone.primaryPhoneCallingCode ?? "").replace(/\D/g, "");
  const digits = num.replace(/\D/g, "").replace(/^0+/, "");
  return code ? `+${code}${digits}` : num.replace(/\D/g, "");
}
