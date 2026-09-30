/**
 * The Actor fields Twenty stamps on every record it creates/updates.
 * When the dialer writes via the API key, Twenty attributes the change to
 * the anonymous "dialer" actor unless we pass a real workspaceMember,
 * which is what the "Agent" column in call history and the "Created by"
 * field on records read from.
 *
 * Verified live 2026-09-30 against the workspace:
 *   createdBy -> accepted, comes back as { workspaceMemberId, name }
 *   updatedBy -> IGNORED by Twenty on both create and PATCH; it derives
 *                updatedBy from the auth context, not the payload, and
 *                keeps reporting the "dialer" API actor. Do not try to
 *                fix this here - it is not settable through the API.
 *                Attribution reads createdBy (and any explicit
 *                member-id field on the object).
 */
export interface ActorPayload {
  /** The API-key actor source, so Twenty keeps its own bookkeeping intact. */
  source: "API";
  /** The workspaceMember this session resolved to. */
  workspaceMemberId: string;
  /** Human name for the record's "created by" / "updated by" display. */
  name: string;
}

export interface WriteActor {
  createdBy?: ActorPayload;
  updatedBy?: ActorPayload;
}