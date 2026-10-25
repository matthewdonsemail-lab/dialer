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

/**
 * Formats an Australian phone number (landline or mobile) to canonical E.164 (+61...).
 * Handles domestic area codes (02 Sydney/NSW, 03 Melbourne/VIC, 07 Brisbane/QLD, 08 Perth/SA/WA)
 * and mobile numbers (04xx xxx xxx).
 */
export function toAustralianE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already E.164 with +
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/\D/g, "");
    return digits.startsWith("61") ? `+${digits}` : `+${digits}`;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // Starts with 61 (e.g. 61291234567 or 61412345678)
  if (digits.startsWith("61") && (digits.length === 11 || digits.length === 10)) {
    return `+${digits}`;
  }

  // 10 digits starting with 0 (e.g. 0291234567 or 0412345678)
  if (digits.startsWith("0") && digits.length === 10) {
    return `+61${digits.slice(1)}`;
  }

  // 9 digits without leading 0 (e.g. 291234567 or 412345678)
  if (digits.length === 9) {
    return `+61${digits}`;
  }

  return toE164(raw);
}
