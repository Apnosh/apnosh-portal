-- Migration: Add onboarding fields to businesses table
-- These columns support the expanded onboarding flow that collects
-- detailed business information for the content engine.

-- User role in the business
alter table businesses add column if not exists user_role text;

-- Business type "Other" freeform text
alter table businesses add column if not exists industry_other text;

-- Food-business-specific fields
alter table businesses add column if not exists cuisine text;
alter table businesses add column if not exists cuisine_other text;
alter table businesses add column if not exists service_styles text[];

-- Location details
alter table businesses add column if not exists location_count text;
alter table businesses add column if not exists business_hours jsonb; -- { Mon: { open, close, closed }, ... }

-- Customer & positioning
alter table businesses add column if not exists customer_types text[];
alter table businesses add column if not exists why_choose text[];

-- Goals & success
alter table businesses add column if not exists primary_goal text;
alter table businesses add column if not exists goal_detail text;
alter table businesses add column if not exists success_signs text[];
alter table businesses add column if not exists timeline text;

-- What to promote
alter table businesses add column if not exists main_offerings text;
alter table businesses add column if not exists upcoming text;

-- Content preferences (arrays, unlike the existing text columns)
alter table businesses add column if not exists content_likes text[];
alter table businesses add column if not exists ref_accounts text;
alter table businesses add column if not exists avoid_list text[];

-- Workflow preferences
alter table businesses add column if not exists approval_type text; -- full, partial, minimal, rolling
alter table businesses add column if not exists can_film text[];
alter table businesses add column if not exists can_tag text; -- yes or no

-- Assets
alter table businesses add column if not exists brand_drive text;

-- Terms agreement
alter table businesses add column if not exists agreed_terms boolean default false;
alter table businesses add column if not exists agreed_terms_at timestamptz;
