/**
 * Set up a Twenty workspace with every object and field the dialer uses
 * (manifest.ts). Additive and safe to re-run.
 *
 *   bun run twenty:schema          create whatever is missing
 *   bun run twenty:schema:check    dry run: only report what is missing
 *   ... -- --json                  print the full report as JSON
 *
 * Reads TWENTY_BASE_URL / TWENTY_API_KEY from the environment, then from
 * .env.local (repo root, then backend/). Exits 1 when anything failed, or in
 * a dry run when anything is missing.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApplyItem } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** KEY=value lines; the real environment and earlier files win. */
function loadEnvFiles(): void {
  for (const file of [path.join(ROOT, ".env.local"), path.join(ROOT, "backend", ".env.local")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFiles();
const dryRun = process.argv.includes("--dry-run");
const asJson = process.argv.includes("--json");
if (!process.env.TWENTY_BASE_URL || !process.env.TWENTY_API_KEY) {
  console.error("TWENTY_BASE_URL and TWENTY_API_KEY must be set (environment or .env.local).");
  process.exit(1);
}

// Imported after the env is loaded: the logger and client read it.
const { applySchema } = await import("./applySchema.js");

const line = (i: ApplyItem) =>
  `  ${i.status.padEnd(8)} ${i.kind.padEnd(9)} ${i.object}.${i.name}${i.note ? `  (${i.note})` : ""}`;

try {
  const report = await applySchema({ dryRun, onItem: asJson ? undefined : (i) => i.status !== "present" && console.log(line(i)) });
  const count = (s: ApplyItem["status"]) => report.items.filter((i) => i.status === s).length;
  const drift = report.items.filter((i) => i.status === "present" && i.note);
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const i of drift) console.log(line(i));
    console.log(
      `\n${dryRun ? "Dry run" : "Applied"} against ${process.env.TWENTY_BASE_URL}: ` +
        `${count("present")} present, ${dryRun ? `${count("missing")} missing` : `${count("created")} created`}, ` +
        `${count("failed")} failed, ${drift.length} drifted.`,
    );
  }
  process.exit(count("failed") > 0 || (dryRun && count("missing") > 0) ? 1 : 0);
} catch (err) {
  console.error(`Schema setup failed: ${(err as Error).message}`);
  process.exit(1);
}
