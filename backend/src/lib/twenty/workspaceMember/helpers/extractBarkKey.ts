/**
 * RICH_TEXT fields come back from REST as `{ blocknote, markdown }`
 * and from GraphQL as either null or the same shape. The UI at
 * /settings/objects/workspaceMembers edits label BARK_KEY / name barkKey.
 * Only the markdown string is the device key — trim whitespace because
 * rich-text editing often leaves trailing newlines.
 *
 * Pure: no I/O, no request objects.
 */
export function extractBarkKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof raw === "object") {
    const obj = raw as { markdown?: unknown; blocknote?: unknown };
    if (typeof obj.markdown === "string") {
      const trimmed = obj.markdown.trim();
      return trimmed ? trimmed : null;
    }
  }
  return null;
}