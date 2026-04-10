-- Add demographics JSONB column to social_metrics for caching audience data
ALTER TABLE social_metrics
  ADD COLUMN IF NOT EXISTS demographics jsonb;
