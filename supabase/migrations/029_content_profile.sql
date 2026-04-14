-- ============================================================
-- Migration 029: Content Profile
-- Adds fields to clients table for AI content generation context
-- ============================================================

-- Target audience
ALTER TABLE clients ADD COLUMN IF NOT EXISTS target_audience jsonb DEFAULT '{}';
-- { age_range: "25-45", gender: "all", income: "middle", lifestyle: "foodies, families", pain_points: ["finding quality restaurants", "weeknight meal ideas"] }

-- Products/services/menu highlights
ALTER TABLE clients ADD COLUMN IF NOT EXISTS offerings jsonb DEFAULT '[]';
-- ["signature tasting menu", "weekend brunch", "happy hour specials", "private dining", "catering"]

-- Content pillars (3-5 strategic themes)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS content_pillars jsonb DEFAULT '[]';
-- ["behind the scenes", "menu highlights", "community & staff", "education & tips", "seasonal specials"]

-- Topics and tone to avoid
ALTER TABLE clients ADD COLUMN IF NOT EXISTS content_avoid jsonb DEFAULT '[]';
-- ["politics", "competitor mentions", "price complaints", "negative reviews"]

-- Hashtag strategy
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hashtag_sets jsonb DEFAULT '{}';
-- { branded: ["#GoldenSpoonSeattle", "#TasteTheGold"], community: ["#SeattleEats", "#CapitolHillFood"], location: ["#SeattleRestaurants", "#PNWFood"] }

-- CTA preferences (ordered by preference)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cta_preferences jsonb DEFAULT '[]';
-- ["Book a table — link in bio", "DM us for reservations", "Call us at (206) 555-1234"]

-- Key people to feature in content
ALTER TABLE clients ADD COLUMN IF NOT EXISTS key_people jsonb DEFAULT '[]';
-- [{ name: "Chef Maria", role: "Head Chef", comfortable_on_camera: true, notes: "Great at explaining dishes" }]

-- Filming locations / photogenic spots
ALTER TABLE clients ADD COLUMN IF NOT EXISTS filming_locations jsonb DEFAULT '[]';
-- [{ name: "Main dining room", notes: "Best natural light 2-4pm", good_for: ["food shots", "ambiance"] }, { name: "Kitchen", notes: "Loud, needs lapel mic", good_for: ["BTS", "cooking demos"] }]

-- Competitors (who they are, what to differentiate from)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS competitors jsonb DEFAULT '[]';
-- [{ name: "The Walrus and the Carpenter", handle: "@walrusseattle", notes: "Strong seafood content, we differentiate on Indian cuisine" }]

-- Seasonal business patterns
ALTER TABLE clients ADD COLUMN IF NOT EXISTS seasonal_notes text;
-- "Busy season: Jun-Sep (tourist traffic). Slow: Jan-Feb. Brunch is strongest revenue driver year-round."
