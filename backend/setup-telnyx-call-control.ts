/**
 * One-off: create (or find) the Telnyx Call Control application used for
 * phone audio (Settings -> Audio Source: Call me / Dial in). Safe to re-run.
 *
 *   cd backend && npx tsx --env-file=../.env.local setup-telnyx-call-control.ts --list
 *   cd backend && npx tsx --env-file=../.env.local setup-telnyx-call-control.ts https://dialer.listeningkit.com
 *
 * The webhook URL carries TELNYX_WEBHOOK_TOKEN, which must match the value
 * the deployed backend uses. Prints the application id to put in
 * TELNYX_CALL_CONTROL_APP_ID. Assign a number to the app for Dial in.
 */
import Telnyx from "telnyx";

const APP_NAME = "Cold Dialer phone audio";

async function main() {
  const apiKey = process.env.TELNYX_API_KEY;
  const token = process.env.TELNYX_WEBHOOK_TOKEN;
  if (!apiKey) throw new Error("TELNYX_API_KEY is not set");
  const client = new Telnyx({ apiKey });

  const profiles: any[] = [];
  for await (const p of client.outboundVoiceProfiles.list()) profiles.push(p);
  const apps: any[] = [];
  for await (const a of client.callControlApplications.list()) apps.push(a);

  if (process.argv.includes("--list")) {
    console.log("Outbound voice profiles:");
    for (const p of profiles) console.log(`  ${p.id}  ${p.name}  enabled=${p.enabled}`);
    console.log("Call Control applications:");
    for (const a of apps) console.log(`  ${a.id}  ${a.application_name}  active=${a.active}  outbound_profile=${a.outbound?.outbound_voice_profile_id ?? "-"}`);
    return;
  }

  const base = process.argv[2]?.replace(/\/$/, "");
  if (!base || !/^https:\/\//.test(base)) throw new Error("Pass the public backend origin, e.g. https://dialer.listeningkit.com");
  if (!token) throw new Error("TELNYX_WEBHOOK_TOKEN is not set");

  const existing = apps.find((a) => a.application_name === APP_NAME);
  if (existing) {
    console.log(`Already exists: ${existing.id}`);
    console.log(`TELNYX_CALL_CONTROL_APP_ID=${existing.id}`);
    return;
  }
  const profile = profiles.find((p) => p.enabled !== false);
  if (!profile) throw new Error("No outbound voice profile found; create one in the Telnyx portal first");

  const created = await client.callControlApplications.create({
    application_name: APP_NAME,
    webhook_event_url: `${base}/api/webhooks/telnyx?token=${encodeURIComponent(token)}`,
    webhook_api_version: "2",
    dtmf_type: "RFC 2833",
    active: true,
    outbound: { outbound_voice_profile_id: profile.id },
  });
  const id = (created as any)?.data?.id;
  console.log(`Created "${APP_NAME}" using outbound profile ${profile.name}`);
  console.log(`TELNYX_CALL_CONTROL_APP_ID=${id}`);
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
