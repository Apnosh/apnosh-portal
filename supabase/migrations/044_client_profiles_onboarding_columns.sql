-- ============================================
-- Add missing onboarding columns to client_profiles
-- Migration: 044_client_profiles_onboarding_columns
-- ============================================
-- These columns are needed by the onboarding form but were not included
-- in the initial client_profiles table (migration 043).

ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS business_type_other text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS competitors text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS full_address text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS zip text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS location_count text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS hours jsonb;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS business_phone text;
