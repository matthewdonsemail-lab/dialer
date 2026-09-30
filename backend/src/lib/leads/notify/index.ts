import type { Request } from "express";
import { createLogger } from "../../logger/index.js";
import { sendBarkPush } from "../../bark/index.js";
import { listWorkspaceMembers } from "../../twenty/workspaceMember/index.js";
import { buildLeadDeepLink, formatLeadBody } from "./helpers/index.js";
import type { NewLeadInfo, LeadBroadcastResult } from "./types.js";

export type { NewLeadInfo, LeadBroadcastResult };

const log = createLogger("lead-notify");

/** Request -> the plain values the pure deep-link helper needs. */
function requestOriginParts(req: Request): { proto: string; host: string } {
  const protoHeader = req.get("x-forwarded-proto");
  const proto = (protoHeader ? protoHeader.split(",")[0].trim() : req.protocol) || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  return { proto, host };
}

/**
 * Cross-path dedupe: the dialer POST /api/leads hook and the Twenty
 * native webhook (agencyLead.created) both funnel here. A dialer-created
 * lead would otherwise notify twice (once per path), so each path marks
 * the lead id and skips ids marked within the TTL. In-memory only —
 * fine for a single backend instance; use Twenty/Redis if you scale out.
 */
const notifiedAt = new Map<string, number>();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

export function wasRecentlyNotified(leadId: string): boolean {
  const at = notifiedAt.get(leadId);
  if (!at) return false;
  if (Date.now() - at > DEDUPE_TTL_MS) {
    notifiedAt.delete(leadId);
    return false;
  }
  return true;
}

export function markLeadNotified(leadId: string): void {
  notifiedAt.set(leadId, Date.now());
}

/**
 * Global broadcast: push a new-lead notification to EVERY workspaceMember
 * that has a BARK_KEY configured. Fire-and-forget from the caller — this
 * never throws, it only logs per-member failures so one bad key can't fail
 * the lead creation itself.
 */
export async function broadcastNewLead(
  req: Request,
  lead: NewLeadInfo,
): Promise<LeadBroadcastResult> {
  const result: LeadBroadcastResult = { attempted: 0, sent: 0, skippedNoKey: 0, failed: 0 };
  let members: Awaited<ReturnType<typeof listWorkspaceMembers>>;
  try {
    members = await listWorkspaceMembers();
  } catch (err: any) {
    log.error(`New-lead broadcast aborted (member lookup failed): ${err.message}`);
    return result;
  }

  const withKey = members.filter((m) => Boolean(m.barkKey));
  result.skippedNoKey = members.length - withKey.length;
  if (withKey.length === 0) {
    log.info(`New lead ${lead.id}: no members have BARK_KEY, skipping broadcast`);
    return result;
  }

  const { proto, host } = requestOriginParts(req);
  const url = buildLeadDeepLink({
    frontendUrl: process.env.FRONTEND_URL,
    proto,
    host,
    leadId: lead.id,
  });
  const body = formatLeadBody(lead);
  log.info(`New lead ${lead.id}: broadcasting to ${withKey.length} member(s), url=${url}`);

  const outcomes = await Promise.allSettled(
    withKey.map((m) =>
      sendBarkPush(m.barkKey as string, {
        title: "New lead",
        body,
        group: "leads",
        url,
        level: "timeSensitive",
      }),
    ),
  );
  result.attempted = withKey.length;
  for (const o of outcomes) {
    if (o.status === "fulfilled" && o.value.ok) result.sent += 1;
    else result.failed += 1;
  }
  if (result.failed > 0) {
    log.error(`New lead ${lead.id}: ${result.failed}/${result.attempted} Bark pushes failed`);
  } else {
    log.info(`New lead ${lead.id}: ${result.sent}/${result.attempted} Bark pushes sent`);
  }
  return result;
}