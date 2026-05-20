-- Vendor + freelancer applications.
--
-- Public-facing /become-a-vendor form. Anyone can submit without
-- being logged in. Admins review in /admin/vendor-applications
-- and approve into a real vendor row (with vendor_type='individual'
-- for freelancers or 'company' for agencies).
--
-- Why a separate table from vendors: applications are unstructured
-- intake (email, portfolio URL, blurb) and most won't be approved.
-- Keeping them out of vendors keeps the live marketplace clean.

create table if not exists vendor_applications (
  id uuid primary key default gen_random_uuid(),
  /* Type of supply they want to be: individual freelancer or
     company/agency. */
  applicant_type text not null check (applicant_type in ('individual','company')),
  /* Public-facing name they want shown on the marketplace. */
  display_name text not null,
  email text not null,
  phone text,
  /* What service categories they want to offer (matches vendor_listings.category). */
  categories text[] not null default '{}',
  /* Geographic coverage they offer. Default WA. */
  service_area text[] not null default '{WA}',
  /* Portfolio + sample work URLs. */
  portfolio_url text,
  social_handle text,
  sample_work_urls text[] not null default '{}',
  /* Pitch: who they are, who they serve, why they want in. */
  pitch text not null,
  /* Rate range they typically charge. Free-form. */
  typical_rate text,
  /* Years experience working with restaurants specifically. */
  restaurant_experience_years int,
  /* Status of the application. */
  status text not null default 'pending'
    check (status in ('pending','reviewing','approved','declined','withdrawn')),
  /* Set when admin resolves. If approved, vendor_id points at the
     new vendor row created from this application. */
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  vendor_id uuid references vendors(id),
  admin_notes text,
  /* Optional: track which client referred them (e.g., a restaurant
     recommended their photographer). */
  referrer_client_id uuid references clients(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_applications_status_idx
  on vendor_applications (status, created_at desc);
create index if not exists vendor_applications_email_idx
  on vendor_applications (email);

alter table vendor_applications enable row level security;

drop policy if exists "admin all vendor applications" on vendor_applications;
drop policy if exists "anyone inserts vendor application" on vendor_applications;

create policy "admin all vendor applications"
  on vendor_applications for all
  using (is_admin()) with check (is_admin());

/* Anyone (signed in or anonymous) can submit an application — this
   is the public funnel. Reads gated to admins. */
create policy "anyone inserts vendor application"
  on vendor_applications for insert
  with check (true);

comment on table vendor_applications is
  'Inbound applications to join the Apnosh marketplace. Reviewed by admins; approved ones spawn a vendor row.';
