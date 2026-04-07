-- ============================================================
-- Client Management + Social Post Generator Schema
-- ============================================================
-- Separate from the SaaS portal's `businesses` table.
-- This schema supports agency creative production: brand systems,
-- asset management, style libraries, content queues, and post generation.

-- ── UPDATED_AT TRIGGER FUNCTION ──
-- Reusable trigger to auto-set updated_at on row update
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- CLIENTS
-- ============================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text,
  location text,
  website text,
  primary_contact text,
  email text,
  phone text,
  socials jsonb not null default '{}',
  services_active text[] not null default '{}',
  tier text check (tier in ('Basic', 'Standard', 'Pro', 'Internal')),
  monthly_rate numeric,
  billing_status text not null default 'active' check (billing_status in ('active', 'paused', 'cancelled', 'past_due')),
  onboarding_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clients_slug on clients(slug);
create index idx_clients_billing_status on clients(billing_status);

create trigger clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ============================================================
-- CLIENT USERS (foundation for future client-facing access)
-- ============================================================
create table client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'owner' check (role in ('owner', 'manager', 'contributor')),
  invited_at timestamptz not null default now(),
  last_login timestamptz,
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled'))
);

create index idx_client_users_client on client_users(client_id);
create index idx_client_users_email on client_users(email);

-- ============================================================
-- CLIENT BRANDS
-- ============================================================
create table client_brands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade unique,
  brand_md text,
  primary_color text,
  secondary_color text,
  accent_color text,
  font_display text,
  font_body text,
  logo_url text,
  voice_notes text,
  photo_style text,
  visual_style text check (visual_style in ('glass_morphism', 'clean_minimal', 'bold_colorful', 'photo_forward', 'custom')),
  texture_overlay text not null default 'none' check (texture_overlay in ('none', 'grain', 'paper', 'noise')),
  depth_style text check (depth_style in ('flat', 'glass_morphism', 'layered_shadows', '3d_inspired')),
  edge_treatment text check (edge_treatment in ('clean', 'iridescent', 'gradient_border', 'none')),
  client_editable_fields jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create trigger client_brands_updated_at
  before update on client_brands
  for each row execute function set_updated_at();

-- ============================================================
-- CLIENT PATTERNS (content strategy)
-- ============================================================
create table client_patterns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade unique,
  patterns_md text,
  updated_at timestamptz not null default now()
);

create trigger client_patterns_updated_at
  before update on client_patterns
  for each row execute function set_updated_at();

-- ============================================================
-- CLIENT ASSETS
-- ============================================================
create table client_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  type text not null check (type in ('logo', 'photo', 'graphic', 'social_proof', 'other')),
  file_url text not null,
  thumbnail_url text,
  filename text,
  tags text[] not null default '{}',
  description text,
  quality_rating text check (quality_rating in ('hero', 'good', 'filler')),
  orientation text check (orientation in ('landscape', 'portrait', 'square')),
  mood text check (mood in ('moody_warm', 'bright_airy', 'dramatic', 'casual', 'minimal')),
  usage_history text[] not null default '{}',
  uploaded_by text not null default 'admin' check (uploaded_by in ('admin', 'client')),
  uploaded_by_user_id uuid references client_users(id),
  uploaded_at timestamptz not null default now()
);

create index idx_client_assets_client on client_assets(client_id);
create index idx_client_assets_type on client_assets(client_id, type);

-- ============================================================
-- STYLE LIBRARY (approved posts catalog)
-- ============================================================
create table style_library (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  post_code text not null,
  image_url text,
  html_source text,
  template_type text check (template_type in ('insight', 'stat', 'tip', 'compare', 'result', 'photo', 'custom')),
  platform text check (platform in ('instagram', 'tiktok', 'linkedin')),
  size text check (size in ('feed', 'square', 'story')),
  caption text,
  hashtags text,
  alt_text text,
  performance_notes text,
  style_notes text,
  client_visible boolean not null default true,
  status text not null default 'approved' check (status in ('approved', 'archived')),
  approved_at timestamptz not null default now()
);

create index idx_style_library_client on style_library(client_id);
create index idx_style_library_post_code on style_library(client_id, post_code);

-- ============================================================
-- CONTENT QUEUE
-- ============================================================
create table content_queue (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  request_type text not null default 'internal' check (request_type in ('client_request', 'internal')),
  submitted_by text not null default 'admin' check (submitted_by in ('admin', 'client')),
  submitted_by_user_id uuid references client_users(id),
  input_text text,
  input_photo_url text,
  template_type text check (template_type in ('insight', 'stat', 'tip', 'compare', 'result', 'photo', 'custom')),
  platform text check (platform in ('instagram', 'tiktok', 'linkedin')),
  size text not null default 'feed' check (size in ('feed', 'square', 'story')),
  drafts jsonb not null default '[]',
  selected_draft integer,
  designer_notes text,
  status text not null default 'new' check (status in ('new', 'drafting', 'in_review', 'approved', 'scheduled', 'posted')),
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_content_queue_client on content_queue(client_id);
create index idx_content_queue_status on content_queue(status);

create trigger content_queue_updated_at
  before update on content_queue
  for each row execute function set_updated_at();

-- ============================================================
-- CLIENT FEEDBACK (foundation for future client approval workflow)
-- ============================================================
create table client_feedback (
  id uuid primary key default gen_random_uuid(),
  content_queue_id uuid not null references content_queue(id) on delete cascade,
  user_id uuid references client_users(id),
  feedback_type text not null check (feedback_type in ('approval', 'revision', 'comment')),
  message text,
  created_at timestamptz not null default now()
);

create index idx_client_feedback_queue on client_feedback(content_queue_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Admin-only policies for now. Comments mark where client-scoped
-- policies will be added. The pattern will be:
--   client_users.client_id = {table}.client_id
--   where auth.uid() maps to a client_users row via Supabase Auth.

alter table clients enable row level security;
alter table client_users enable row level security;
alter table client_brands enable row level security;
alter table client_patterns enable row level security;
alter table client_assets enable row level security;
alter table style_library enable row level security;
alter table content_queue enable row level security;
alter table client_feedback enable row level security;

-- Admin policies (full CRUD on all tables)
create policy "Admins manage clients" on clients for all using (is_admin());
create policy "Admins manage client_users" on client_users for all using (is_admin());
create policy "Admins manage client_brands" on client_brands for all using (is_admin());
create policy "Admins manage client_patterns" on client_patterns for all using (is_admin());
create policy "Admins manage client_assets" on client_assets for all using (is_admin());
create policy "Admins manage style_library" on style_library for all using (is_admin());
create policy "Admins manage content_queue" on content_queue for all using (is_admin());
create policy "Admins manage client_feedback" on client_feedback for all using (is_admin());

-- FUTURE: Client-scoped read/write policies
-- Each policy below would be added when client auth is implemented.
-- The scoping pattern: EXISTS (SELECT 1 FROM client_users WHERE client_users.client_id = {table}.client_id AND client_users.id = auth.uid())

-- clients: client reads own row only
-- CREATE POLICY "Client reads own" ON clients FOR SELECT USING (id IN (SELECT client_id FROM client_users WHERE id = auth.uid()));

-- client_brands: client reads own, writes only client_editable_fields
-- CREATE POLICY "Client reads own brand" ON client_brands FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE id = auth.uid()));
-- Note: write policy would use a check function that compares old vs new and only allows changes to fields listed in client_editable_fields

-- client_assets: client reads + inserts own, no delete
-- CREATE POLICY "Client reads own assets" ON client_assets FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE id = auth.uid()));
-- CREATE POLICY "Client uploads own assets" ON client_assets FOR INSERT WITH CHECK (client_id IN (SELECT client_id FROM client_users WHERE id = auth.uid()) AND uploaded_by = 'client');

-- style_library: client reads own where client_visible = true
-- CREATE POLICY "Client reads visible posts" ON style_library FOR SELECT USING (client_visible = true AND client_id IN (SELECT client_id FROM client_users WHERE id = auth.uid()));

-- content_queue: client reads + inserts own (request_type = 'client_request')
-- CREATE POLICY "Client reads own queue" ON content_queue FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE id = auth.uid()));
-- CREATE POLICY "Client submits requests" ON content_queue FOR INSERT WITH CHECK (client_id IN (SELECT client_id FROM client_users WHERE id = auth.uid()) AND request_type = 'client_request' AND submitted_by = 'client');

-- client_feedback: client reads + inserts own
-- CREATE POLICY "Client reads own feedback" ON client_feedback FOR SELECT USING (content_queue_id IN (SELECT id FROM content_queue WHERE client_id IN (SELECT client_id FROM client_users WHERE id = auth.uid())));
-- CREATE POLICY "Client submits feedback" ON client_feedback FOR INSERT WITH CHECK (content_queue_id IN (SELECT id FROM content_queue WHERE client_id IN (SELECT client_id FROM client_users WHERE id = auth.uid())));


-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Note: Run these via Supabase dashboard or supabase CLI.
-- Included here for documentation.
--
-- insert into storage.buckets (id, name, public) values ('client-logos', 'client-logos', true);
-- insert into storage.buckets (id, name, public) values ('client-photos', 'client-photos', true);
-- insert into storage.buckets (id, name, public) values ('client-graphics', 'client-graphics', true);
-- insert into storage.buckets (id, name, public) values ('post-drafts', 'post-drafts', false);


-- ============================================================
-- SEED DATA: Apnosh (Client Zero)
-- ============================================================

-- Insert Apnosh client
insert into clients (name, slug, industry, location, website, primary_contact, email, socials, services_active, tier, notes)
values (
  'Apnosh',
  'apnosh',
  'AI Marketing Agency',
  'Washington State',
  'https://www.apnosh.com',
  'Mark',
  'admin@apnosh.com',
  '{"instagram": "@apnoshmarketing", "tiktok": "@apnosh", "linkedin": "linkedin.com/company/apnosh", "facebook": "facebook.com/profile.php?id=61566938144164"}'::jsonb,
  ARRAY['Social Media', 'Content', 'Brand'],
  'Internal',
  'Client Zero. All workflows tested here first.'
);

-- Insert Apnosh brand system
insert into client_brands (client_id, primary_color, secondary_color, accent_color, font_display, font_body, visual_style, depth_style, edge_treatment, texture_overlay, voice_notes, photo_style, brand_md)
values (
  (select id from clients where slug = 'apnosh'),
  '#4abd98',
  '#2e9a78',
  '#eaf7f3',
  'Playfair Display',
  'Inter',
  'glass_morphism',
  'glass_morphism',
  'iridescent',
  'none',
  'Direct, plain-spoken, no buzzwords. Teaches from experience. 5th grade reading level. No em dashes. Active voice. Honest numbers.',
  'Real photos only. Moody close-ups, authentic BTS. Glass frames with border-radius 16-24px.',
  E'# Apnosh Brand System\n\n## Color Tokens\n\n| Token | Hex | Usage |\n|-------|-----|-------|\n| `brand` | `#4abd98` | Primary brand green |\n| `brand-d` | `#2e9a78` | Dark brand, headlines, CTAs |\n| `brand-t` | `#eaf7f3` | Tint backgrounds, hover states |\n| `brand-g` | `linear-gradient(135deg, #4abd98, #2e9a78)` | Gradient fills |\n| `ink` | `#1d1d1f` | Primary text |\n| `ink-2` | `#424245` | Secondary text |\n| `ink-3` | `#6e6e73` | Tertiary text |\n| `ink-4` | `#aeaeb2` | Placeholder, disabled |\n| `ink-5` | `#d2d2d7` | Dividers |\n| `ink-6` | `#f0f0f5` | Borders, separators |\n| `bg` | `#ffffff` | Primary background |\n| `bg-2` | `#f5f5f7` | Secondary background |\n| `red` | `#ff3b30` | Errors, destructive |\n\n## Glass Morphism\n\n### Primary Glass\n```css\nbackground: rgba(255, 255, 255, 0.55);\nbackdrop-filter: blur(20px);\n-webkit-backdrop-filter: blur(20px);\nborder: 1px solid rgba(255, 255, 255, 0.3);\nbox-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);\nborder-radius: 20px;\n```\n\n### Dark Glass\n```css\nbackground: rgba(29, 29, 31, 0.65);\nbackdrop-filter: blur(24px);\n-webkit-backdrop-filter: blur(24px);\nborder: 1px solid rgba(255, 255, 255, 0.08);\ncolor: white;\n```\n\n## Aurora Gradient Blobs\nDecorative background elements using radial gradients:\n```css\n.aurora-green { background: radial-gradient(circle at 30% 40%, rgba(74, 189, 152, 0.25), transparent 60%); filter: blur(60px); }\n.aurora-teal { background: radial-gradient(circle at 70% 60%, rgba(46, 154, 120, 0.2), transparent 60%); filter: blur(60px); }\n.aurora-purple { background: radial-gradient(circle at 50% 20%, rgba(147, 51, 234, 0.12), transparent 50%); filter: blur(60px); }\n.aurora-pink { background: radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1), transparent 50%); filter: blur(60px); }\n```\n\n## Iridescent Border\n```css\n&::before {\n  content: '''';\n  position: absolute;\n  inset: -1px;\n  border-radius: inherit;\n  background: linear-gradient(135deg, rgba(236,72,153,0.15), rgba(59,130,246,0.15), rgba(74,189,152,0.15), rgba(251,146,60,0.1));\n  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);\n  mask-composite: xor;\n  -webkit-mask-composite: xor;\n  padding: 1px;\n  pointer-events: none;\n}\n```\n\n## Button System\n\n### Primary (btn-brand)\n```css\nbackground: #4abd98;\ncolor: white;\nborder-radius: 12px;\npadding: 14px 32px;\nfont-weight: 600;\nfont-size: 15px;\ntransition: all 0.2s;\n```\nCTA pulse animation: subtle box-shadow pulse on key buttons.\n\n### Secondary (btn-glass)\n```css\nbackground: rgba(255, 255, 255, 0.55);\nbackdrop-filter: blur(12px);\nborder: 1px solid rgba(255, 255, 255, 0.3);\ncolor: #1d1d1f;\nborder-radius: 12px;\npadding: 14px 32px;\n```\n\n## Background\n```css\nbody {\n  background: linear-gradient(135deg, #f0faf6 0%, #f5f5f7 35%, #edf7f2 65%, #f5f5f7 100%);\n}\n```\n\n## Typography\n\n### Display Font: Playfair Display\nUsed for: headlines, hero text, section titles.\nStyle: italic emphasis in `#2e9a78` for key phrases.\n\n### Body Font: Inter\nUsed for: body text, UI, buttons.\n\n### Tag/Kicker Pattern\n```css\ntext-transform: uppercase;\nletter-spacing: 0.12em;\nfont-size: 11px;\ncolor: #2e9a78;\nfont-weight: 600;\n```\n\n## Writing Rules\n- 5th grade reading level\n- No em dashes (use periods or commas)\n- Active voice always\n- Honest numbers (never round up, show real data)\n- Headline italic emphasis pattern: key phrase in Playfair Display italic, #2e9a78\n- Never use: "leverage", "synergy", "cutting-edge", "next level"\n- No exclamation points in headlines\n\n## Photo Style\n- Real photos only (no stock, no AI-generated)\n- Moody close-ups preferred\n- Authentic behind-the-scenes\n- Glass frame treatment: border-radius 16-24px\n- Social proof screenshots in glass containers\n\n## Logo\n- Primary: Apnosh wordmark\n- Always placed at bottom of social posts\n- Minimum padding: 24px from edges'
);

-- Insert Apnosh content patterns
insert into client_patterns (client_id, patterns_md)
values (
  (select id from clients where slug = 'apnosh'),
  E'# Apnosh Content Strategy\n\n## Channel Strategy\n\n### LinkedIn (Founder-led: Mark)\nMark posts tips framed through building Apnosh. Mix of practical insights and founder story.\n- **Frequency:** 2-3x/week\n- **Format:** Text posts with occasional image, carousels for frameworks\n- **Voice:** Direct, teaches from experience, vulnerable about real numbers\n- **Hashtags:** 2-3 max per post\n\n### Instagram / TikTok (Brand channel)\n- Before/after comparisons\n- Stat highlights with glass morphism treatment\n- Educational carousels\n- Client work showcases (with permission)\n- Behind-the-scenes\n- **Frequency:** 3-4x/week feed, daily stories\n\n## Content Mix\n\n| Type | Frequency | Platforms |\n|------|-----------|----------|\n| Founder insight | 2-3x/week | LinkedIn |\n| Marketing tip | 2x/week | LinkedIn + IG |\n| Client result | 1x/week | IG + LinkedIn |\n| Educational carousel | 1x/week | IG + TikTok |\n| BTS | 1-2x/week | IG Stories + TikTok |\n\n## Tone\n- Direct, plain-spoken\n- No buzzwords\n- Teaches from experience\n- Shows real numbers, not vanity metrics\n\n## Never Use\n- "leverage"\n- "synergy"\n- "cutting-edge"\n- "next level"\n- Exclamation points in headlines\n\n## Hashtag Strategy\n\n### Instagram Core\n#SmallBusinessMarketing #RestaurantMarketing #LocalSEO\n\n### Instagram Niche\n#GoogleBusinessProfile #RestaurantSocialMedia #LocalBusinessTips\n\n### Branded\n#Apnosh #AIMarketing\n\n### LinkedIn\nMinimal: 2-3 max, placed at end\n\n## Series Ideas\n- **"Local SEO Tips"** - Weekly actionable SEO advice for local businesses\n- **"Agency Math"** - Real numbers from running a marketing agency\n- **"What We''d Fix First"** - Audit-style posts analyzing real (anonymized) client scenarios\n\n## Template Types\n\n### Insight Post\nFounder perspective or industry observation. Glass card on gradient background.\n\n### Stat Post\nBig number highlight with context. Great for engagement.\n\n### Tip Post\nNumbered tip with explanation. Part of an ongoing series.\n\n### Compare Post\nBefore/after or this vs that. Two-column layout.\n\n### Result Post\nClient success metric with attribution. Social proof.\n\n### Photo Post\nReal photo with glass frame treatment and branded caption overlay.'
);
