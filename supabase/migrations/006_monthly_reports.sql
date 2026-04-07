-- Monthly Reports
-- Stores generated monthly performance reports for each client

create table if not exists monthly_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2024),
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- Report sections stored as JSONB
  summary text,                    -- Executive summary
  gbp_highlights jsonb default '[]',  -- Key GBP metrics and changes
  content_stats jsonb default '{}',   -- Deliverables delivered, approved, published
  top_performing jsonb default '[]',  -- Top performing content pieces
  recommendations jsonb default '[]', -- AI-generated next steps
  custom_notes text,               -- Admin notes/commentary
  -- Metadata
  generated_by uuid references auth.users(id),
  published_at timestamptz,
  viewed_at timestamptz,           -- When client first viewed
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(business_id, month, year)
);

-- RLS policies
alter table monthly_reports enable row level security;

create policy "Clients can view published reports for their business"
  on monthly_reports for select
  using (
    status = 'published'
    and business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  );

create policy "Admins can do everything with reports"
  on monthly_reports for all
  using (is_admin());
