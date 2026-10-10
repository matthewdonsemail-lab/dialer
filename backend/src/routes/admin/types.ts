/** Dialer objects whose Twenty timeline activity the Admin page shows. */
export type AdminObject = "call" | "prospect" | "lead" | "phone" | "callCampaign" | "campaign" | "script" | "message";

export type AdminAction = "created" | "updated" | "deleted" | "restored";

/** One create/update/delete event on a dialer record, as sent to the browser. */
export interface AdminActivity {
  id: string;
  happensAt: string;
  action: AdminAction;
  object: AdminObject;
  recordId: string | null;
  /** Name Twenty cached for the record when the event happened (often blank for API writes). */
  recordName: string | null;
  actor: {
    /** Workspace member when Twenty knows one, else the actor Twenty recorded (the dialer's API key). */
    name: string | null;
    memberId: string | null;
    /** MANUAL | API | WORKFLOW | IMPORT ... as Twenty records it. */
    source: string | null;
  };
  /** Field-level before/after for updates; values are shortened for transport. */
  changes: { field: string; before: unknown; after: unknown }[];
}

export interface AdminActivityResponse {
  activities: AdminActivity[];
  /** Workspace member id -> display name, for joining record creators client-side. */
  members: Record<string, string>;
  /** Total dialer events Twenty holds (all time). */
  totalCount: number | null;
  /** True when the range held more events than the page cap returned. */
  truncated: boolean;
}
