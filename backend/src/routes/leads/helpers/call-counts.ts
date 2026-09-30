import { listTwentyAll } from "../../../lib/twenty/client/index.js";

interface AgencyCallLink {
  agencyLeadId?: string;
}

/**
 * Count persisted agencyCalls per lead in a single fetch.
 * Best-effort: when agencyCalls is not provisioned (or Twenty is
 * unreachable) this returns an empty map so lead reads degrade to
 * call_count 0 instead of failing the request. Pure I/O, no mapping.
 */
export async function getLeadCallCounts(): Promise<Map<string, number>> {
  try {
    const calls = await listTwentyAll<AgencyCallLink>('agencyCalls');
    const counts = new Map<string, number>();
    for (const call of calls) {
      if (call.agencyLeadId) {
        counts.set(call.agencyLeadId, (counts.get(call.agencyLeadId) ?? 0) + 1);
      }
    }
    return counts;
  } catch {
    return new Map();
  }
}
