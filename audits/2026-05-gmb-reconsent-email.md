# GMB Re-consent Email (wk 4 deliverable)

**Status:** Draft for Mark to send. AMs cc'd; clients reply if they have questions.
**Send date:** 2026-06-01 (Q1 wk 4 Monday).
**Send to:** every client with `channel='google_business_profile'` and `status IN ('active','error')` in `channel_connections`.

---

## Subject

Quick reconnect needed for your Google Business Profile

## Body

Hi [first name],

We're rolling out automatic review responses in your portal next week — replies post directly to Google without you copy-pasting.

To turn this on, we need you to reconnect your Google Business Profile one time. Takes 30 seconds:

1. Open [link to /dashboard/connected-accounts]
2. Click **Reconnect** next to Google Business Profile
3. Approve the access request from Google

That's it. Your existing reviews and data stay as is — this only adds the permission to post your responses.

Reply here if anything looks off and your account manager will help.

Thanks,
Mark

---

## Send mechanics

- Use the existing AM-broadcast template in `/admin/messaging` (or send from the founder's inbox if higher-touch).
- After Monday, the portal `/dashboard/connected-accounts` page will show a yellow "Reconnect" banner for the same set — clients who don't open the email will still see the prompt the next time they log in.
- Cron `/api/cron/refresh-tokens` (live since wk 2) flips any GMB row to `status='disconnected'` once its token actually fails. The console (wk 7) surfaces this row in "needs attention." So any client who ignores both the email and the in-portal banner ends up surfaced to their AM.

## Expected response

Phase 4 plan said "~20% take 2+ weeks." Don't be alarmed if only ~50% reconnect inside the first week.

## What NOT to do

- Don't auto-revoke their existing token. The current scope is read-only and harmless to keep until they re-authorize.
- Don't send a follow-up email more than once. The in-portal banner does the second-touch work.
