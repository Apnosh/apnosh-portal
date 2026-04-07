-- Style Teaching System
-- Golden examples + style guide storage for AI post generation

-- Golden flag on style_library: marks posts as template references
ALTER TABLE style_library ADD COLUMN IF NOT EXISTS is_golden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_style_library_golden ON style_library(client_id, template_type) WHERE is_golden = true;

-- Style guide HTML storage on client_brands
-- The raw HTML of the client's uploaded style guide, sent to Claude as reference
ALTER TABLE client_brands ADD COLUMN IF NOT EXISTS style_guide_html text;

-- Reference images: URLs of uploaded reference design images
-- Stored as JSONB array of {url, description, template_type}
ALTER TABLE client_brands ADD COLUMN IF NOT EXISTS reference_images jsonb NOT NULL DEFAULT '[]';
