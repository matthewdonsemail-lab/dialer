/**
 * One-off: create the Dialer Audio Session object in Twenty (phone audio:
 * "Call me" / "Dial in"). Safe to re-run.
 *
 *   cd backend && npx tsx --env-file=../.env.local setup-audio-sessions.ts
 *
 * The full `POST /api/setup/twenty` also runs this step.
 */
import { setupAudioSessionSchema } from "./src/lib/twenty/audioSession/index.js";

setupAudioSessionSchema()
  .then((r) => {
    console.log(r.objectIsNew ? "Created dialerAudioSessions object" : "dialerAudioSessions object already existed");
    for (const f of r.fields) console.log(`  ${f.isNew ? "created" : "exists "}  ${f.name}`);
  })
  .catch((err) => {
    console.error("Setup failed:", err?.message ?? err);
    process.exit(1);
  });
