-- Vendor portfolio items + Supabase Storage bucket.
--
-- Each vendor can upload portfolio pieces (photos, screenshots,
-- mockups). These power the hero image carousel on marketplace cards
-- and the gallery on vendor profile pages.
--
-- Images live in the `vendor-portfolio` Supabase Storage bucket.
-- The DB row points at the storage path; the app constructs public
-- URLs at render time via supabase.storage.from('vendor-portfolio').

create table if not exists vendor_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  /* Storage path within the vendor-portfolio bucket, e.g.
     "apnosh/2026-05-19-yellowbee-shoot.jpg". App resolves to a
     public URL on read. */
  storage_path text not null,
  /* Optional thumbnail variant for card carousels. NULL = use original. */
  thumbnail_path text,
  /* Display caption shown beneath the image on profile gallery. */
  caption text,
  /* Category this work demonstrates (matches vendor_listings.category).
     Used to filter "show me this vendor's food photos" vs "show me
     their reels". */
  category text check (category is null or category in (
    'food_influencer','photographer','videographer',
    'graphic_designer','web_designer','social_manager',
    'local_seo','email_marketer','pr_specialist',
    'strategist','full_service_agency','other'
  )),
  /* For sorting on the profile gallery. Lower = earlier. */
  display_order int not null default 0,
  /* Featured items appear in the card hero carousel. Vendors pick
     their 3 best. */
  featured boolean not null default false,
  /* Optional link to external work (Instagram post, live site, etc.) */
  external_url text,
  /* Width + height in pixels — captured at upload time so the UI
     can avoid layout shift. */
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists vendor_portfolio_vendor_idx
  on vendor_portfolio_items (vendor_id, display_order);
create index if not exists vendor_portfolio_featured_idx
  on vendor_portfolio_items (vendor_id, featured) where featured = true;
create index if not exists vendor_portfolio_category_idx
  on vendor_portfolio_items (category) where category is not null;

alter table vendor_portfolio_items enable row level security;

drop policy if exists "admin all portfolio" on vendor_portfolio_items;
drop policy if exists "anyone reads portfolio" on vendor_portfolio_items;

create policy "admin all portfolio"
  on vendor_portfolio_items for all
  using (is_admin()) with check (is_admin());

/* Anyone (signed in or anonymous) can read portfolio items —
   marketplace pages are public. */
create policy "anyone reads portfolio"
  on vendor_portfolio_items for select
  using (true);

comment on table vendor_portfolio_items is
  'Portfolio pieces uploaded by vendors. Images live in the vendor-portfolio storage bucket.';

-- ─────────────────────────────────────────────────────────────────
-- Storage bucket
-- ─────────────────────────────────────────────────────────────────
/* Create the public bucket for portfolio images. Public so the
   marketplace card carousel and vendor profile gallery can load
   images without signed URLs. Vendors upload via signed uploads
   from the vendor dashboard. */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-portfolio',
  'vendor-portfolio',
  true,
  10485760,  -- 10 MB per image
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

/* Storage RLS — public read, admin-only write for now.
   Vendor-self uploads will be enabled in Phase 3 (vendor dashboard)
   via vendor-role-aware policies. */
drop policy if exists "public read vendor portfolio" on storage.objects;
drop policy if exists "admin writes vendor portfolio" on storage.objects;

create policy "public read vendor portfolio"
  on storage.objects for select
  using (bucket_id = 'vendor-portfolio');

create policy "admin writes vendor portfolio"
  on storage.objects for all
  using (bucket_id = 'vendor-portfolio' and is_admin())
  with check (bucket_id = 'vendor-portfolio' and is_admin());
