---
type: is
id: is-01m4dbcqw0zr1ag6nfghdfmthm
title: agencyCall.status is a SELECT without VOICEMAIL/WRONG_NUMBER/DNC; Softphone writes them
kind: bug
status: open
priority: 1
version: 1
labels: []
dependencies: []
created_at: 2026-10-08T08:52:02.047Z
updated_at: 2026-10-08T08:52:02.047Z
---
Live Twenty metadata (2026-10-08): agencyCall.status SELECT options = IN_PROGRESS, COMPLETED, FAILED, NO_ANSWER, BUSY. frontend/src/lib/call-outcome.ts assumes a TEXT field and maps voicemail->VOICEMAIL, wrong_number->WRONG_NUMBER, dnc->DNC; backend routes/calls passes status through. Those dispositions will be rejected by Twenty on create/update. Fix options: (A, preferred) add VOICEMAIL, WRONG_NUMBER, DNC options to agencyCall.status in Twenty (prod schema change: needs owner OK); (B) map to existing values and lose the distinction. Not verified by a live write (would create a CRM record).
