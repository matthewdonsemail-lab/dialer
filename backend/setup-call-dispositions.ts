// Adds agencyCall.notes (TEXT) and agencyCall.disposition (SELECT) when missing.
// Idempotent: existing fields are left exactly as they are.
//   npx tsx setup-call-dispositions.ts (from backend/)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });
const { setupCallHistorySchema } = await import("./src/lib/twenty/agencyCall/index.js");
const result = await setupCallHistorySchema();
for (const f of result.fields.filter((f) => f.name === "notes" || f.name === "disposition")) {
  console.log(`${f.name}: ${f.isNew ? "created" : "already present"}`);
}
