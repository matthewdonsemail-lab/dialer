import { createLogger } from "../../logger/index.js";
import { twentyClient } from "../client/index.js";
import { extractBarkKey } from "./helpers/index.js";
import type { WorkspaceMemberRecord, MemberLookup } from "./types.js";

export * from "./helpers/index.js";
export type { WorkspaceMemberRecord, MemberLookup };

const log = createLogger("workspace-member");

function normalizeMember(raw: any): WorkspaceMemberRecord {
  const name = raw?.name && typeof raw.name === "object" ? raw.name : {};
  return {
    ...raw,
    id: String(raw?.id || ""),
    userId: raw?.userId ?? null,
    userEmail: raw?.userEmail ?? null,
    firstName: name.firstName ?? null,
    lastName: name.lastName ?? null,
    barkKeyRaw: raw?.barkKey ?? null,
    barkKey: extractBarkKey(raw?.barkKey),
  };
}

/**
 * workspaceMembers IS readable over the existing REST + GraphQL APIs —
 * no direct Postgres/SSH tunnel is needed. Verified live:
 *   GET {TWENTY_BASE_URL}/rest/workspaceMembers?limit=1 -> 200
 *   POST {TWENTY_BASE_URL}/graphql { workspaceMembers { edges { node { barkKey } } } } -> 200
 * The node01 Postgres path from the twenty skill remains a valid fallback,
 * but the backend already has TWENTY_API_KEY so REST is the primary path.
 */
export async function listWorkspaceMembers(): Promise<WorkspaceMemberRecord[]> {
  const records = await twentyClient.list<any>("workspaceMembers", 200);
  return records.map(normalizeMember);
}

/**
 * Identify the workspace member a system response belongs to.
 * Resolution order: workspaceMemberId (exact id) -> userId -> email
 * (case-insensitive match on userEmail).
 */
export async function findWorkspaceMember(
  lookup: MemberLookup,
): Promise<WorkspaceMemberRecord | null> {
  const email = lookup.email?.trim().toLowerCase() || null;
  const userId = lookup.userId?.trim() || null;
  const memberId = lookup.workspaceMemberId?.trim() || null;

  if (!email && !userId && !memberId) return null;

  const members = await listWorkspaceMembers();

  if (memberId) {
    const byId = members.find((m) => m.id === memberId);
    if (byId) return byId;
  }
  if (userId) {
    const byUserId = members.find((m) => m.userId === userId);
    if (byUserId) return byUserId;
  }
  if (email) {
    const byEmail = members.find(
      (m) => typeof m.userEmail === "string" && m.userEmail.toLowerCase() === email,
    );
    if (byEmail) return byEmail;
  }
  log.info(`workspaceMember not found for lookup (email set: ${Boolean(email)})`);
  return null;
}

/** Convenience: resolve the member then return its BARK_KEY (or null). */
export async function getBarkKeyForMember(
  lookup: MemberLookup,
): Promise<{ member: WorkspaceMemberRecord; barkKey: string | null } | null> {
  const member = await findWorkspaceMember(lookup);
  if (!member) return null;
  return { member, barkKey: member.barkKey ?? null };
}