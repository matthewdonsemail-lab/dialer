import type { AuthRequest } from "../../../middleware/auth.js";
import type { ActorPayload, WriteActor } from "./types.js";
import { findWorkspaceMember } from "../workspaceMember/index.js";

export type { ActorPayload, WriteActor };

/**
 * Resolve the actor a write on behalf of this request should carry.
 *
 * Returns null when the JWT predates the member migration (no
 * `workspaceMemberId`), so the caller falls back to today's behavior
 * (Twenty's API-key actor) rather than breaking. The name lookup is
 * cached in-process so repeated writes for the same member are cheap.
 */
const memberNameCache = new Map<string, string>();

export async function resolveActor(req: AuthRequest): Promise<WriteActor | null> {
  const memberRef = req.workspaceMemberId?.trim();
  if (!memberRef) return null;

  let name = memberNameCache.get(memberRef);
  if (!name) {
    const member = await findWorkspaceMember({ workspaceMemberId: memberRef });
    if (!member) {
      // The member row may have been deleted; still attribute the id so
      // records point at the right person even if the display name is blank.
      name = req.userFullName?.trim() || req.userEmail || memberRef;
    } else {
      name = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.userEmail || memberRef;
    }
    memberNameCache.set(memberRef, name);
  }

  const actor: ActorPayload = { source: "API", workspaceMemberId: memberRef, name };
  return { createdBy: actor, updatedBy: actor };
}