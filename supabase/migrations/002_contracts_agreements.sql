-- ============================================================
-- Apnosh Client Portal — Contracts, Agreements & Invoicing
-- ============================================================

-- ── Extend BUSINESSES with legal/entity fields ──
alter table businesses
  add column if not exists legal_business_name text,
  add column if not exists dba_name text,
  add column if not exists entity_type text check (entity_type in ('llc', 'corp', 's_corp', 'sole_prop', 'partnership', 'nonprofit', 'other')),
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_email text,
  add column if not exists primary_contact_phone text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists client_status text not null default 'pending_agreement'
    check (client_status in ('pending_agreement', 'agreement_sent', 'agreement_signed', 'active', 'paused', 'offboarded'));

-- ── AGREEMENT TEMPLATES ──
create table agreement_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('master_service_agreement', 'scope_amendment', 'addendum')),
  version integer not null default 1,
  content text not null default '',
  is_active boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_agreement_templates_type on agreement_templates(type);
create index idx_agreement_templates_active on agreement_templates(is_active) where is_active = true;

-- ── AGREEMENTS ──
create table agreements (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  agreement_type text not null check (agreement_type in ('master_service_agreement', 'scope_amendment', 'addendum')),
  version_number integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'signed', 'expired', 'cancelled')),
  template_id uuid references agreement_templates(id),
  custom_fields jsonb not null default '{}',
  rendered_content text,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  signed_by_name text,
  signed_by_email text,
  signed_by_ip text,
  expires_at timestamptz,
  pdf_url text,
  docusign_envelope_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_agreements_business on agreements(business_id);
create index idx_agreements_status on agreements(status);

-- ── CLIENT ACTIVITY LOG ──
create table client_activity_log (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  action_type text not null check (action_type in (
    'agreement_sent', 'agreement_viewed', 'agreement_signed',
    'invoice_sent', 'invoice_paid', 'invoice_overdue',
    'scope_change', 'note_added', 'status_change',
    'client_created', 'onboarding_completed'
  )),
  description text not null default '',
  performed_by uuid references profiles(id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_activity_log_business on client_activity_log(business_id);
create index idx_activity_log_type on client_activity_log(action_type);

-- ── CLIENT NOTES ──
create table client_notes (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  author_id uuid not null references profiles(id),
  author_name text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_client_notes_business on client_notes(business_id);

-- ── CLIENT DOCUMENTS ──
create table client_documents (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  file_url text not null,
  file_type text,
  file_size integer,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_client_documents_business on client_documents(business_id);

-- ── Enhance INVOICES with line items, invoice numbers, agreement link ──
alter table invoices
  add column if not exists agreement_id uuid references agreements(id),
  add column if not exists invoice_number text unique,
  add column if not exists tax_amount numeric not null default 0,
  add column if not exists total numeric,
  add column if not exists due_date timestamptz,
  add column if not exists payment_method text,
  add column if not exists line_items jsonb not null default '[]',
  add column if not exists notes text;

-- ── Auto-generate invoice numbers ──
create or replace function generate_invoice_number()
returns trigger as $$
declare
  seq_num integer;
  yr text;
begin
  yr := to_char(now(), 'YYYY');
  select coalesce(max(
    cast(split_part(invoice_number, '-', 3) as integer)
  ), 0) + 1
  into seq_num
  from invoices
  where invoice_number like 'APN-' || yr || '-%';

  new.invoice_number := 'APN-' || yr || '-' || lpad(seq_num::text, 3, '0');
  return new;
end;
$$ language plpgsql;

create trigger set_invoice_number
  before insert on invoices
  for each row
  when (new.invoice_number is null)
  execute function generate_invoice_number();

-- ── Updated_at triggers ──
create trigger set_agreement_templates_updated_at
  before update on agreement_templates
  for each row execute function set_updated_at();

create trigger set_agreements_updated_at
  before update on agreements
  for each row execute function set_updated_at();

create trigger set_client_notes_updated_at
  before update on client_notes
  for each row execute function set_updated_at();

-- ── RLS Policies ──

-- Agreement Templates: admins can CRUD, clients can read active ones
alter table agreement_templates enable row level security;

create policy "Admins manage agreement templates"
  on agreement_templates for all
  using (is_admin())
  with check (is_admin());

create policy "Clients read active templates"
  on agreement_templates for select
  using (is_active = true);

-- Agreements: admins see all, clients see their own
alter table agreements enable row level security;

create policy "Admins manage all agreements"
  on agreements for all
  using (is_admin())
  with check (is_admin());

create policy "Clients view own agreements"
  on agreements for select
  using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "Clients update own agreements for signing"
  on agreements for update
  using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

-- Activity Log: admins see all, clients see their own
alter table client_activity_log enable row level security;

create policy "Admins view all activity"
  on client_activity_log for all
  using (is_admin())
  with check (is_admin());

create policy "Clients view own activity"
  on client_activity_log for select
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- Client Notes: admins only
alter table client_notes enable row level security;

create policy "Admins manage notes"
  on client_notes for all
  using (is_admin())
  with check (is_admin());

-- Client Documents: admins manage, clients view own
alter table client_documents enable row level security;

create policy "Admins manage all documents"
  on client_documents for all
  using (is_admin())
  with check (is_admin());

create policy "Clients view own documents"
  on client_documents for select
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- ── Seed a default MSA template ──
insert into agreement_templates (name, type, version, content, is_active) values (
  'Master Service Agreement',
  'master_service_agreement',
  1,
  '# MASTER SERVICE AGREEMENT

**This Master Service Agreement** ("Agreement") is entered into as of **{{effective_date}}** by and between:

**Apnosh LLC**, a Washington limited liability company ("Agency"), and

**{{client_legal_name}}**{{client_dba_clause}}, a {{client_entity_type}} ("Client"), with a principal place of business at {{client_address}}.

---

## 1. SERVICES

Agency agrees to provide Client with the following digital marketing services ("Services"):

{{service_scope}}

## 2. TERM

This Agreement shall commence on {{effective_date}} and shall continue on a **month-to-month basis** until terminated by either party in accordance with Section 8.

## 3. COMPENSATION

Client agrees to pay Agency **{{monthly_rate}}** per month for the Services described herein.

### 3.1 Payment Terms
- Payment is due on the **{{payment_due_day}} of each month**
- Payment shall be made via the Apnosh Client Portal or other method agreed upon by the parties
- {{payment_terms}}

### 3.2 Late Fees
- Invoices not paid within **10 days** of the due date will incur a late fee of **{{late_fee_terms}}**
- Agency reserves the right to suspend Services for any invoice overdue by more than 30 days

## 4. INTELLECTUAL PROPERTY

### 4.1 Work Product
{{ip_ownership_terms}}

### 4.2 Client Materials
Client grants Agency a non-exclusive license to use Client''s name, logo, brand assets, and other materials as necessary to perform the Services during the term of this Agreement.

## 5. CONFIDENTIALITY

Each party agrees to keep confidential any proprietary or non-public information disclosed by the other party during the term of this Agreement. This obligation shall survive termination for a period of two (2) years.

## 6. REPRESENTATIONS AND WARRANTIES

Agency represents that it will perform the Services in a professional and workmanlike manner consistent with generally accepted industry standards.

Client represents that it has the authority to enter into this Agreement and that all materials provided to Agency do not infringe upon the rights of any third party.

## 7. LIMITATION OF LIABILITY

In no event shall either party be liable for any indirect, incidental, special, or consequential damages arising out of this Agreement. Agency''s total liability shall not exceed the fees paid by Client in the three (3) months preceding the claim.

## 8. TERMINATION

Either party may terminate this Agreement with **{{notice_period}}** written notice to the other party.

### 8.1 Effect of Termination
- Client shall pay for all Services rendered through the effective date of termination
- Agency shall deliver all completed and in-progress work product to Client
- Any outstanding invoices become due immediately upon termination

## 9. GENERAL PROVISIONS

### 9.1 Governing Law
This Agreement shall be governed by the laws of the State of **{{governing_state}}**.

### 9.2 Entire Agreement
This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements.

### 9.3 Amendments
This Agreement may only be amended by a written instrument signed by both parties.

### 9.4 Force Majeure
Neither party shall be liable for delays or failures in performance resulting from circumstances beyond the reasonable control of the party.

---

**IN WITNESS WHEREOF**, the parties have executed this Agreement as of the date first written above.

**AGENCY:**
Apnosh LLC
By: _________________________
Name: _________________________
Title: _________________________
Date: _________________________

**CLIENT:**
{{client_legal_name}}
By: _________________________
Name: {{signer_name}}
Title: _________________________
Date: {{signature_date}}',
  true
);
