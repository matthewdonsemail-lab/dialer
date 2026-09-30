import { createLogger } from "./logger.js";
import { twentyClient } from "./twenty-client.js";

const log = createLogger("workspace-members");

export interface WorkspaceMemberRecord {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Raw `barkKey` value as Twenty returns it (RICH_TEXT object, string, or null). */
  barkKeyRaw?: unknown;
  /** Extracted Bark device key (trimmed markdown) or null when not configured. */
  barkKey?: string | null;
  [key: string]: unknown;
}

/**
 * RICH_TEXT fields come back from REST as `{ blocknote, markdown }`
 * and from GraphQL as either null or the same shape. The UI at
 * /settings/objects/workspaceMembers edits label BARK_KEY / name barkKey.
 * Only the markdown string is the device key — trim whitespace because
 * rich-text editing often leaves trailing newlines.
 */
export function extractBarkKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof raw === "object") {
    const obj = raw as { markdown?: unknown; blocknote?: unknown };
    if (typeof obj.markdown === "string") {
      const trimmed = obj.markdown.trim();
      return trimmed ? trimmed : null;
    }
  }
  return null;
}

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

export interface MemberLookup {
  email?: string;
  userId?: string;
  workspaceMemberId?: string;
}

/**
 * Identify the workspace member a system response belongs to.
 * Resolution order: workspaceMemberId (exact id) -> userId -> email
 * (case-insensitive match on userEmail). Email is what the dialer JWT
 * carries today (POST /api/oauth/session mints userId/email from the
 * Twenty access-token introspection username), so email lookup is the
 * common path from the OAuth signup flow.
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
  log.info(`Workspace member not found for lookup (email set: ${Boolean(email)})`);
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
