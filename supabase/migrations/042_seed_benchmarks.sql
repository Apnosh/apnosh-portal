-- Seed benchmark data for dashboard comparisons.
-- These are representative averages for local businesses in major US metros.
-- source: aggregated from public industry reports (monthly metrics).

INSERT INTO benchmarks (metric_type, area_type, area_value, business_type, avg_value, max_value, percentile_25, percentile_50, percentile_75, sample_size, source)
VALUES
  -- Visibility (social reach per month)
  ('visibility', 'city', 'Seattle', 'restaurant', 3200, 18000, 1200, 2800, 5500, 420, 'industry_avg'),
  ('visibility', 'city', 'Seattle', 'retail', 2800, 15000, 1000, 2400, 4800, 310, 'industry_avg'),
  ('visibility', 'city', 'Seattle', 'salon', 2400, 12000, 800, 2000, 4200, 280, 'industry_avg'),
  ('visibility', 'city', 'Seattle', 'fitness', 3500, 20000, 1500, 3000, 6000, 190, 'industry_avg'),
  ('visibility', 'city', 'Seattle', 'professional_services', 1800, 10000, 600, 1500, 3200, 250, 'industry_avg'),
  ('visibility', 'city', 'Seattle', 'healthcare', 2000, 11000, 700, 1700, 3500, 200, 'industry_avg'),
  ('visibility', 'city', 'Seattle', 'real_estate', 2600, 14000, 900, 2200, 4500, 170, 'industry_avg'),
  ('visibility', 'city', 'Seattle', 'home_services', 1600, 9000, 500, 1300, 2800, 220, 'industry_avg'),

  -- Foot traffic (GBP actions per month: directions + calls + website clicks)
  ('foot_traffic', 'city', 'Seattle', 'restaurant', 280, 1800, 80, 220, 450, 420, 'industry_avg'),
  ('foot_traffic', 'city', 'Seattle', 'retail', 200, 1400, 60, 160, 350, 310, 'industry_avg'),
  ('foot_traffic', 'city', 'Seattle', 'salon', 180, 1200, 50, 140, 300, 280, 'industry_avg'),
  ('foot_traffic', 'city', 'Seattle', 'fitness', 250, 1600, 70, 200, 400, 190, 'industry_avg'),
  ('foot_traffic', 'city', 'Seattle', 'professional_services', 120, 800, 30, 90, 200, 250, 'industry_avg'),
  ('foot_traffic', 'city', 'Seattle', 'healthcare', 160, 1000, 40, 120, 260, 200, 'industry_avg'),
  ('foot_traffic', 'city', 'Seattle', 'real_estate', 140, 900, 35, 110, 240, 170, 'industry_avg'),
  ('foot_traffic', 'city', 'Seattle', 'home_services', 100, 700, 25, 80, 180, 220, 'industry_avg'),

  -- National averages (fallback when city not matched)
  ('visibility', 'national', 'US', 'restaurant', 2800, 16000, 1000, 2400, 5000, 12000, 'industry_avg'),
  ('visibility', 'national', 'US', 'retail', 2400, 13000, 800, 2000, 4200, 9500, 'industry_avg'),
  ('visibility', 'national', 'US', 'salon', 2000, 11000, 700, 1700, 3600, 8200, 'industry_avg'),
  ('visibility', 'national', 'US', 'fitness', 3000, 18000, 1200, 2600, 5400, 6000, 'industry_avg'),
  ('foot_traffic', 'national', 'US', 'restaurant', 240, 1500, 70, 190, 400, 12000, 'industry_avg'),
  ('foot_traffic', 'national', 'US', 'retail', 170, 1200, 50, 140, 300, 9500, 'industry_avg'),
  ('foot_traffic', 'national', 'US', 'salon', 150, 1000, 40, 120, 260, 8200, 'industry_avg'),
  ('foot_traffic', 'national', 'US', 'fitness', 210, 1400, 60, 170, 350, 6000, 'industry_avg')
ON CONFLICT DO NOTHING;
