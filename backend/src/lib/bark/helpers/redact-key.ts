/** Never log a device key in full. */
export function redactKey(key: string): string {
  if (!key) return "(empty)";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}