// Display-only fallback for the label badge when a prospect has no label. Pure.
export function slugifyIndustryValue(niche: string): string {
  const value = niche.trim().toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  return value.length > 0 ? value : "UNLABELED";
}
