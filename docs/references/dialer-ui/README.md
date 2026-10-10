# Dialer UI references (GoHighLevel, Close, Attio)

These screenshots are the visual source of truth for the contact / dialer / conversations rebuild described in [`docs/plans/CONTACT_DIALER_HANDOFF.md`](../../plans/CONTACT_DIALER_HANDOFF.md).

They were captured on 2026-10-10 from each vendor's public help centre or changelog, so they show the current (2025-2026) UI. The original URL is listed for each one so it can be re-checked.

**How to use them:**
- Copy the interaction patterns and the information layout.
- Do **not** copy the vendors' colours, fonts or icons. Restyle everything with our own `--ods-*` tokens and the house style: Reports, Admin and Scripts pages. See §3 of the plan.
- Do not ship these images in the app. They are reference material only.

## GoHighLevel (primary reference)

| File | What to take from it | Source |
|---|---|---|
| `ghl-01-contact-detail-3panel.png` | **The contact page target.** Left: contact form with collapsible folders and "Hide empty fields". Centre: the conversation feed, with activity cards ("DND enabled", "Opportunity created"), date separator chips, and a composer at the bottom (SMS/WhatsApp tabs, `From:` number picker, `To:`, "Chars: 0, Segs: 0", Clear, Send plus a schedule button). Right: an icon tab rail (activity, tasks, notes, appointments, docs, payments), here showing Tasks with "Add Task" and search | [help article 155000006651](https://help.gohighlevel.com/support/solutions/articles/155000006651) |
| `ghl-02-contact-activity-panel.png` | Right panel Activity tab: a vertical timeline (Contact Created, Appointment Booked, Form Submitted) with source chips. Centre: an SMS failure with a "Retry" action, a "Call failed" bubble, and a voicemail bubble with an inline player. Left: contact card (owner, followers, tags) above "All Fields / DND / Actions" tabs and a field search | same |
| `ghl-03-contact-left-fields-nav.png` | The left fields panel in the app shell (dark sidebar), and the "2/1102 ‹ ›" previous/next-contact pager in the panel header | same |
| `ghl-12-contact-card-2026-redesign.png` | **The 2026 contact card**: name plus engagement badge, delete icon, Owner/Followers pickers, tags with ⊕, the All Fields/DND/Actions segmented tabs, "Search Fields and Folders", a collapsible "Contact" folder, empty values shown as "--", and email verified with a check | [changelog: Contact Detail Page Redesign](https://ideas.gohighlevel.com/changelog/contact-detail-page-redesign) |
| `ghl-04-dialer-keypad-topbar.png` | **The dialer target.** A floating panel opened from the green phone button in the top bar. "Calling From" number picker at the top, a text input, a round 3×4 keypad, a green call button and backspace. Bottom tab bar: Recents, Contacts, Keypad, Voicemail, Queue | [help article 48000981431](https://help.gohighlevel.com/support/solutions/articles/48000981431) |
| `ghl-05-dialer-2026-recents-tabs.png` | 2026 dialer on the Recents tab: "Search for Contacts" and a recents list (avatar, name, "2 hours ago", expand chevron), with the same bottom tab bar | [help article 155000005807](https://help.gohighlevel.com/support/solutions/articles/155000005807) |
| `ghl-08-dialer-in-call-with-script.png` | **The in-call layout.** The "Outgoing Call" panel (avatar, then a control grid: Message, Notes, Blind Transfer / Hold, Mute, Scripts, then a red full-width End Call), with a **Calling Script** pane docked to its left and a script picker dropdown | [help article 155000004935](https://help.gohighlevel.com/support/solutions/articles/155000004935) |
| `ghl-06-dialer-call-summary-disposition.png` | **The post-call screen.** "Call Summary" header showing our number, contact name and number, "Call Ended" plus a "Completed" chip, duration pill, a 2-column grid of disposition chips, then a Done button | [help article 155000007191](https://help.gohighlevel.com/support/solutions/articles/155000007191) |
| `ghl-07-dialer-transfer-call-and-hold-2025.png` | Transfer flow (Users / Dial / Forwards tabs, a "Call & Hold" warm-transfer CTA) and a minimised in-call pill with a timer. This is a later phase | help article 48000981431 |
| `ghl-09-conversations-redesign-2025.png` | **The `/conversations` target.** Inbox list (Unread / All / Recents / Starred, checkbox, star, channel icon on the avatar, unread count badge), the thread, and a Contact Details right panel | [changelog: New Conversations experience](https://ideas.gohighlevel.com/changelog/new-conversations-experience-a-complete-redesign-built-for-speed-clarity-and-con) |
| `ghl-10-conversations-call-bubbles-transcript.png` | **Call items in a thread**: "Call completed" bubble with a recording player (play, waveform, 1x, volume, reload, download), "View Transcript" / timestamped transcript lines, and "No answer" status pills | [changelog: Conversations usability improvements](https://ideas.gohighlevel.com/changelog/conversations-usability-improvements) |
| `ghl-11-manual-actions-call-queue.png` | Manual Actions: a call queue table (Contact, Campaign/Workflow, Date). This is the pattern for a dialing queue | [help article 48000979920](https://help.gohighlevel.com/support/solutions/articles/48000979920) |

## Close

| File | What to take from it | Source |
|---|---|---|
| `close-01-lead-page-header-composer-tabs.png` | Lead header (avatar, name, status dropdown, ⋯). **Action pills at top right: Note, Email, SMS, Call ▾, Activity ▾.** Details/Files tabs on the left. Timeline filters (All, Important, Conversations, Notes & Summaries, All Activities ▾, All Users, All Contacts, All Time) and a pinned item | [help.close.com/feature-guide/leads](https://help.close.com/feature-guide/leads) |
| `close-08-lead-sidebar-panels.png` | Collapsible sidebar sections (Tasks, Opportunities, Contacts) with counts, search and `+`, and per-contact email/SMS/call icons | same |
| `close-02-phone-settings-popover.png` | **Caller ID and audio popover**: number picker, Auto-Record toggle, Output/Ringing/Microphone selects with test buttons and a mic level meter, and a "Dial a number…" input. This is the model for our dialer's settings sheet | [help.close.com/feature-guide/calling](https://help.close.com/feature-guide/calling) |
| `close-03-call-activities-disposition-icons.png` | Call rows in the timeline: green phone for connected, red for attempted or missed, and direction arrows (up-right for outbound, down-right for inbound) | same |
| `close-04-call-note-composer.png` | A call note written inline on the call activity (rich text, Done) | same |
| `close-05-call-recording-player.png` | Call activity header ("Called X - 4 secs · date", flag, call back, edit) above a collapsible Recording player | same |
| `close-06-power-dialer-pause-next.png` | Power dialer controls: Pause and **Next Call →** | [Power Dialer](https://help.close.com/feature-guide/power-predictive-dialing/using-the-power-dialer) |
| `close-07-inbox-channel-tabs-localtime.png` | Inbox tabs by channel (Primary, Emails, Calls, Messages, Tasks, Reminders) with counts, and the contact's local-time tooltip (a moon icon marks after hours) | [Inbox](https://help.close.com/feature-guide/inbox) |

## Attio (layout density and the record-page model)

| File | What to take from it | Source |
|---|---|---|
| `attio-01-record-page-overview.png` | Left attribute sidebar (icon + label + value rows, chips, "View all values", a Lists section). Tabs: Overview, Activity, Emails, Notes, Tasks, Files, Calls, with counts. Overview shows Highlights cards and compact Activity/Emails/Notes lists | [Attio help: records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) |
| `attio-02-activity-timeline.png` | Activity tab grouped as Upcoming / This week, with actor rows, embedded meeting and task cards, "View settings" and "Add meeting" | same |
| `attio-03-call-recording-transcript-insights.png` | Call recording page: Transcript / Speakers / Meeting tabs with speaker and timestamp lines, and Summary and Insights on the right. This is the model for `/history/:callId` | [Attio: call recordings](https://attio.com/help/reference/productivity-collaborating/call-intelligence/view-and-manage-call-recordings) |

## Not captured (blocked or not public)

- GHL Jumpshare-hosted screenshots: the domain is blocked from our capture browser.
- Close SMS thread image: 404.
- Close and GHL animated GIFs: these would only give a first frame.

The text descriptions of these are in the plan, §2.
