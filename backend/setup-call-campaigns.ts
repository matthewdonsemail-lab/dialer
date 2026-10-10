/**
 * One-off: create the Call Campaign object and its fields in Twenty.
 * Safe to re-run; existing object/fields are left as they are.
 *
 *   cd backend && npx tsx --env-file=../.env.local setup-call-campaigns.ts
 *
 * The full `POST /api/setup/twenty` also runs this step.
 */
import { setupCallCampaignSchema } from "./src/lib/twenty/callCampaign/index.js";

setupCallCampaignSchema()
  .then((result) => {
    console.log(result.objectIsNew ? "Created callCampaigns object" : "callCampaigns object already existed");
    for (const f of result.fields) console.log(`  ${f.isNew ? "created" : "exists "}  ${f.name}`);
  })
  .catch((err) => {
    console.error("Setup failed:", err?.message ?? err);
    process.exit(1);
  });
