# Meta Tester Onboarding — AM One-Pager

**Who this is for:** Account managers connecting a client's Instagram + Facebook
while the Apnosh Meta app is in **Development mode (Standard Access)**.

**Why we do this:** Standard Access only works for people added to the app as
testers. Adding each client as a tester lets them OAuth their IG/FB and pull
real insights **without App Review**. This path is good for roughly the first
~100 clients, so a small pilot sits comfortably inside it.

**Where the tool lives:** Admin → Client → **Connections tab → "Meta App tester
onboarding"** panel. It tracks Facebook and Instagram separately, each moving
`Not invited → Invited, waiting → Accepted`.

---

## Before you start (per client)

- [ ] Client has a **Facebook account that is an admin of their Facebook Page**
- [ ] Their Page is linked to an **Instagram Business or Creator account** (not a personal IG)
- [ ] You've collected: **Page name**, **IG @username**, **email on their Facebook account**

---

## Step 1 — Facebook tester

- [ ] Open the panel's **App roles** link → `developers.facebook.com/apps/<APP_ID>/roles/roles/`
- [ ] **Roles → Add People → Testers**, invite by the client's **Facebook email**
- [ ] In the panel, click **"Mark invite sent"** (status → *Invited, waiting*)
- [ ] Client accepts at **facebook.com/settings → Business Integrations / app invites**
- [ ] Once confirmed, click **"Mark accepted"**

## Step 2 — Instagram tester

- [ ] Open the panel's **Test users** link → `developers.facebook.com/apps/<APP_ID>/roles/test-users/`
- [ ] Add the client by **IG @username**; enter the username in the panel's IG field so it's on record
- [ ] Click **"Mark invite sent"**
- [ ] Client accepts **inside the Instagram mobile app**:
      Settings → Apps and Websites → **Tester Invites → Accept**
- [ ] Once confirmed, click **"Mark accepted"**

## Step 3 — Connect + verify

- [ ] Both rows show green **"Accepted"** (panel marks the client done when FB + IG are both accepted)
- [ ] Client runs the normal **OAuth** in their dashboard (Connect Instagram / Facebook) — now succeeds
- [ ] Confirm a token saved on the connection row
- [ ] Check the dashboard **funnel** fills in Social reach / followers / engagement within a sync cycle
- [ ] If it stays blank, re-check the token and trigger a manual sync

---

## Two gotchas

- **Facebook is manual by email.** We can't auto-add a Facebook tester via API
  until we have the client's FB user id, which we only get **after** they OAuth.
  So FB invites are sent manually by email; the panel just records the status.
- **Instagram accepts in the app, not on the web.** Clients routinely miss this.
  The IG tester invite is accepted **inside the Instagram mobile app**, not on a
  website. Say it up front or you'll get "I don't see the invite" tickets.

---

## When to graduate off this path

Move to **App Review** (the lighter, insights-only one) when any of these is true:

- You want to go past a hand-held pilot into self-serve / many clients
- The tester-invite step becomes a real onboarding drag
- You're ready to sell social insights as a standard, no-friction feature
