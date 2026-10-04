/**
 * Can the dialer map a token to a member? Simulate the resolution chain
 * against the live member list using the signals introspection could carry.
 */
import { config } from "dotenv";
config({ path: "../.env.local" });

const { listWorkspaceMembers } = await import("./src/lib/twenty/workspaceMember/index.js");

const SUB = "ee6ec732-3045-44e8-840c-4f0859e2d16f"; // the sub from the live log

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailsFromClaims(claims: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const value of Object.values(claims)) {
    if (typeof value !== "string") continue;
    const t = value.trim();
    if (EMAIL_RE.test(t) && !found.includes(t)) found.push(t);
  }
  return found;
}

async function main() {
  const members = await listWorkspaceMembers();
  console.log(`members: ${members.length}`);

  // Signal 1: sub as a workspaceMember record id
  const byId = members.find((m) => m.id === SUB);
  console.log(`1. sub as memberId -> ${byId ? byId.userEmail : "no match"}`);

  // Signal 2: sub as the member's userId
  const byUser = members.find((m) => m.userId === SUB);
  console.log(`2. sub as userId   -> ${byUser ? byUser.userEmail : "no match"}`);

  // Signal 3: any email-shaped claim
  // Scenarios for what Twenty might send, to show the chain works when the
  // email IS present.
  const scenarios: Array<Record<string, unknown>> = [
    { active: true, sub: SUB, scope: "api profile" },
    { active: true, sub: SUB, email: "mandeep@inferencesaver.com" },
    { active: true, sub: SUB, preferred_username: "mandeep@inferencesaver.com" },
    { active: true, sub: SUB, username: "mandeep@inferencesaver.com" },
  ];
  for (const [i, claims] of scenarios.entries()) {
    const emails = emailsFromClaims(claims);
    const resolved = emails
      .map((e) => members.find((m) => (m.userEmail || "").toLowerCase() === e.toLowerCase()))
      .find(Boolean);
    console.log(
      `3.${i + 1} claims [${Object.keys(claims).join(",")}] emails=${JSON.stringify(emails)} -> ${
        resolved ? `${resolved.userEmail} (${resolved.firstName} ${resolved.lastName})` : "UNRESOLVED -> 403"
      }`,
    );
  }

  console.log("");
  console.log("conclusion: with the real token, the chain resolves iff introspection");
  console.log("carries an email claim. The live log's sub alone cannot resolve.");
}

main().catch((e) => {
  console.error("FAIL: " + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});