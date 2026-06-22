# Apnosh Portal

Owner-facing marketing portal. Next.js 16 (App Router), React 19, Supabase.

> The current, in-progress app lives on the **`design/mvp-home`** branch, not `main`.
> Always start from `design/mvp-home`.

---

## Current task: redesign the "Create a campaign" flow

We want a few independent takes on the create-a-campaign page so we can compare
them. Each person works on **their own branch**, pushes it, and gets a **live
preview URL** from Vercel. We compare the previews, then fold the winning design
into the app.

### 1. Get access (one-time, ask the owner)

- **Push access** to this repo (you need to be added as a collaborator so your
  branch builds a preview).
- The **`.env.local`** file. It holds the secret keys and is intentionally NOT in
  this repo. The owner sends it to you privately. Save it at the project root.
  Note: these keys point at the **live** backend, so anything you save writes to
  real data.

### 2. Run it locally

```bash
git clone https://github.com/Apnosh/apnosh-portal.git
cd apnosh-portal
git checkout design/mvp-home    # the current app (NOT main)
git pull
npm install
# drop the .env.local file the owner sent you into this folder
npm run dev                     # http://localhost:3000
```

Sign in, then open the Create flow at **`/dashboard/campaigns/new`** (or tap the
**+** in the bottom nav). Edits hot-reload, so design with the dev server running.

### 3. Make your own branch

```bash
git checkout design/mvp-home
git checkout -b create-redesign-<yourname>
```

### 4. Where the Create flow lives

The whole flow is one mostly self-contained file. Reshape it however feels
intuitive to you.

| File | What it is | You edit it? |
|------|------------|--------------|
| `src/components/mvp/campaign-builder/apnosh-campaign.jsx` | **The entire design + flow** (catalog browse, the build screen, generated steps, confirm). Plain React with inline styles. | **Yes, this is the one.** |
| `src/app/dashboard/campaigns/new/page.tsx` | The route that mounts the flow | Rarely |
| `src/components/mvp/campaign-builder/builder-entry.tsx` | Feeds it the real menu + business name, handles save | Only if you change its inputs or saving |
| `src/lib/campaigns/builder/adapter.ts` | Turns the builder's output into a saved campaign | Only if you change what gets saved |

You do not need to touch the backend. If you only restyle and restructure
`apnosh-campaign.jsx`, the existing save still works.

### 5. Share your version for comparison

```bash
git add -A
git commit -m "Create redesign: <yourname>"
git push origin create-redesign-<yourname>
```

Pushing triggers a **Vercel preview build**. Open a Pull Request for your branch
and the preview link is posted right on it (or find it in the Vercel dashboard).
Send that link to the owner. It opens on a phone, so it is easy to compare.

---

## Scripts

```bash
npm run dev      # local dev server
npm run build    # production build
npm run start    # serve the production build
```

## Stack notes

- App Router under `src/app`. The owner experience is the mobile "mvp" UI under
  `src/app/dashboard` + `src/components/mvp`.
- Supabase for auth + data. Browser and server clients live in `src/lib`.
- Env vars: copy `.env.example` to `.env.local` and fill in (owner provides the
  real values).
