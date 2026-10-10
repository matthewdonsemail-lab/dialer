/**
 * SMS length rules, as carriers (and Telnyx's `parts`) count them. A message
 * that fits the GSM-7 alphabet takes 160 characters in one part and 153 per
 * part once split; anything else (emoji, curly quotes, most accents) is sent
 * as UCS-2: 70 in one part, 67 per part.
 */

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Extension characters: each costs two GSM-7 units (escape + char). */
const GSM7_EXT = "^{}\[~]|€\f";

export interface SmsCount {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the carrier counts them (extension chars count twice). */
  units: number;
  segments: number;
  /** Units left before another part is added. */
  remaining: number;
}

export function countSms(text: string): SmsCount {
  let gsm = true;
  let units = 0;
  for (const ch of text) {
    if (GSM7.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (!gsm) units = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  const capacity = segments <= 1 ? single : segments * multi;
  return { encoding: gsm ? "GSM-7" : "UCS-2", units, segments, remaining: capacity - units };
}
