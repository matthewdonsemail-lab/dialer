# Screenshots

Every page and tab of the dialer in light mode, captured from the demo workspace
(fictional businesses, 555 numbers, `.example` addresses), never from a real CRM.

Regenerate them all, and this file, with:

```bash
bun run screenshots
```

The capture is [scripts/screenshots/captureScreenshots.ts](../../scripts/screenshots/captureScreenshots.ts). It answers
every API request from [apiFixtures.ts](../../scripts/screenshots/apiFixtures.ts), which runs the demo records in
[backend/src/lib/demo](../../backend/src/lib/demo/records/demoRecords.ts) through the real route mappers.

## Sign in with Twenty

**Sign in with Twenty**

![Sign in with Twenty](login.png)

## Reports

**overview**

![Reports: overview](reports-overview.png)

**number health**

![Reports: number health](reports-numbers.png)

**team performance**

![Reports: team performance](reports-team.png)

**disposition report**

![Reports: disposition report](reports-dispositions.png)

## Contacts

**Contacts**

![Contacts](contacts.png)

## Contact

**call summary**

![Contact: call summary](contact-summary.png)

**record history**

![Contact: record history](contact-history.png)

**call script**

![Contact: call script](contact-script.png)

**notes**

![Contact: notes](contact-notes.png)

**website and video**

![Contact: website and video](contact-website.png)

## Lead

**Lead**

![Lead](lead.png)

## Dialer

**recents**

![Dialer: recents](dialer-recents.png)

**contacts**

![Dialer: contacts](dialer-contacts.png)

**keypad**

![Dialer: keypad](dialer-keypad.png)

**settings**

![Dialer: settings](dialer-settings.png)

**live call**

![Dialer: live call](dialer-live.png)

**live call with notes**

![Dialer: live call with notes](dialer-live-notes.png)

**live call with the script beside it**

![Dialer: live call with the script beside it](dialer-live-script.png)

**live call with the contact beside it**

![Dialer: live call with the contact beside it](dialer-live-contact.png)

**contacts with every filter open**

![Dialer: contacts with every filter open](dialer-contacts-filters.png)

**a contact's details beside the dock**

![Dialer: a contact's details beside the dock](dialer-contact-details.png)

**after the call**

![Dialer: after the call](dialer-summary.png)

## Call history

**Call history**

![Call history](history.png)

## Call review

**overview**

![Call review: overview](call-overview.png)

**recording and transcript**

![Call review: recording and transcript](call-recording.png)

**AI review**

![Call review: AI review](call-ai.png)

**activity**

![Call review: activity](call-activity.png)

**technical**

![Call review: technical](call-technical.png)

## Scripts

**Scripts**

![Scripts](scripts.png)

## Phone numbers

**Phone numbers**

![Phone numbers](phone-numbers.png)

## Admin

**overview**

![Admin: overview](admin-overview.png)

**activity log**

![Admin: activity log](admin-activity.png)

**team activity**

![Admin: team activity](admin-team.png)

**data objects**

![Admin: data objects](admin-objects.png)

## Settings

**appearance**

![Settings: appearance](settings-appearance.png)

**audio source**

![Settings: audio source](settings-audio.png)

**reports**

![Settings: reports](settings-reports.png)

**account**

![Settings: account](settings-account.png)
