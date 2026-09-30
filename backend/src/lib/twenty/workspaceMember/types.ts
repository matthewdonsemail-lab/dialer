/**
 * The workspaceMember row as the dialer needs it. `name` arrives as a
 * FullName object, so the flattened firstName/lastName are the fields the
 * dialer actually reads.
 */
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

/** The ways one write can be attributed to a member. Resolution order is fixed. */
export interface MemberLookup {
  email?: string;
  userId?: string;
  workspaceMemberId?: string;
}