import type { TwentyRecord } from "../../lib/twenty/client/index.js";

/** agencyMessages row (SMS ledger in Twenty; relations read as {field}Id). */
export interface AgencyMessage extends TwentyRecord {
  direction?: string;
  status?: string;
  body?: string;
  fromNumber?: string;
  toNumber?: string;
  telnyxMessageId?: string;
  agencyProspectId?: string;
  agencyLeadId?: string;
}

export interface SendMessageBody {
  prospectId?: string;
  leadId?: string;
  to: string;
  /** agencyPhones row id (preferred — enforces the number registry). */
  fromPhoneId?: string;
  /** Raw E.164 sender; must match a known agency number. */
  from?: string;
  body: string;
}
