/** Flag SVGs are separate files fetched on demand, so the bundle does not carry all 260+. */
const FLAG_URLS: Record<string, string> = (() => {
  const files = import.meta.glob<string>("@flags/*.svg", { query: "?no-inline", import: "default", eager: true });
  const byCode: Record<string, string> = {};
  for (const [file, url] of Object.entries(files)) {
    const code = /([A-Z]{2}(?:-[A-Z]+)?)\.svg$/.exec(file)?.[1];
    if (code) byCode[code] = url;
  }
  return byCode;
})();

export function flagUrl(code: string | null): string | null {
  return code ? FLAG_URLS[code] ?? null : null;
}
