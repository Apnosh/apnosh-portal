-- Configurable production turnaround times per cycle (in business days)
ALTER TABLE content_cycles
  ADD COLUMN IF NOT EXISTS editing_turnaround_days integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS client_review_days integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS design_turnaround_days integer DEFAULT 2;
