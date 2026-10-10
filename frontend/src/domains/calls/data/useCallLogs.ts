import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/domains/api/client";
import type { Database } from "@/domains/api/database";

type CallLog = Database["public"]["Tables"]["call_logs"]["Row"];

export function useCallLogs() {
  return useQuery<CallLog[]>({
    queryKey: ["callLogs"],
    queryFn: async () => {
      return api.callLogs.list();
    },
    staleTime: Infinity,
  });
}

export function useCallLog(leadId: string) {
  return useQuery<CallLog[]>({
    queryKey: ["callLogs", leadId],
    queryFn: async () => {
      return api.callLogs.getByLead(leadId);
    },
    enabled: !!leadId,
    staleTime: Infinity,
  });
}

export function useCreateCallLog() {
  const queryClient = useQueryClient();
  return useMutation<CallLog, Error, Omit<CallLog, "id" | "created_at">>({
    mutationFn: async (log) => {
      return api.callLogs.create(log);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["callLogs"] });
    },
  });
}

export interface AgencyCallRecord {
  id: string;
  name: string | null;
  direction: string | null;
  status: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  telnyxCallId: string | null;
  telnyxRecordingId: string | null;
  recordingUrl: string | null;
  transcript: string | null;
  transcriptionStatus: string | null;
  summary: string | null;
  aiSummary: string | null;
  aiSentiment: string | null;
  aiScore: number | null;
  aiKeyPoints: string | null;
  aiScores: string | null;
  aiConfidence: number | null;
  aiModel: string | null;
  aiAnalyzedAt: string | null;
  meetingUrl: string | null;
  meetingProvider: string | null;
  meetingAt: string | null;
  meetingStatus: string | null;
  meetingBookingId: string | null;
  agencyPhoneId: string | null;
  agencyProspectId: string | null;
  agencyLeadId: string | null;
  createdBy: { name?: string; source?: string } | null;
  created_at: string;
  updated_at: string;
}

/** Live call records from Twenty agencyCalls (replaces legacy call_logs). */
export function useCalls() {
  return useQuery<AgencyCallRecord[]>({
    queryKey: ["calls"],
    queryFn: async () => {
      return api.calls.list();
    },
    // Short, and refreshed in the background, so a list that missed a refresh
    // (e.g. while Twenty was rate limiting) catches up within half a minute
    // instead of showing the calls from when the page opened.
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

/** Calls linked to one lead or prospect. */
export function useCallsForRecord(record: { leadId?: string | null; prospectId?: string | null }) {
  const { data: calls } = useCalls();
  const { leadId, prospectId } = record;
  return (calls ?? []).filter((c) =>
    (leadId && c.agencyLeadId === leadId) || (prospectId && c.agencyProspectId === prospectId)
  );
}
