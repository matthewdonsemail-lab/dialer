/**
 * The Actor Twenty stamps on a record it creates.
 *
 * When the dialer writes with its API key, Twenty attributes the change to
 * the anonymous "dialer" API actor, which is what made call history show
 * "dialer" instead of the member. Passing `createdBy` fixes that: the
 * backend authenticates as the API key but names the member.
 *
 * Verified live 2026-09-30 against the workspace:
 *   createdBy -> accepted, reads back { workspaceMemberId, name }.
 *   updatedBy -> NOT settable. Tested both REST PATCH and the GraphQL
 *                `updateAgencyCall` mutation with a nested Actor: the
 *                mutation is accepted, but Twenty recomputes updatedBy
 *                from the authenticated caller and still reports the
 *                API actor. There is no API path to set it, so it is not
 *                part of this type. Attribution reads `createdBy`.
 */
export interface ActorPayload {
  /** The API-key actor source, so Twenty keeps its own bookkeeping intact. */
  source: "API";
  /** The workspaceMember this session resolved to. */
  workspaceMemberId: string;
  /** Human name for the record's "created by" display. */
  name: string;
}

export interface WriteActor {
  createdBy?: ActorPayload;
}