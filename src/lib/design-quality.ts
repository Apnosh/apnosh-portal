/**
 * Design quality framework — the stuff that pushes Claude from "competent
 * generic site" to "world-class designed site."
 *
 * Used by every design endpoint (generate-site, refine-site, design-claude,
 * extract-from-url) to inject concrete principles + examples into the
 * system prompt.
 *
 * The principles are deliberately specific. Vague principles ("be elegant")
 * produce vague copy. Specific ones ("name a noun, not a category") produce
 * actually-good copy.
 */

export const DESIGN_PRINCIPLES = `
# How world-class restaurant + retail sites are different from generic ones

## Hero copy

GOOD hero headlines:
- "Korean BBQ, Meant to Be Shared." (Do Si KBBQ — names the verb that defines the experience)
- "Pasta Made the Long Way." (Restaurant Italia — claims a method, not adjectives)
- "A Sushi Bar with One Seat. Yours." (Omakase — specific, image-creating)
- "Espresso. Bagels. Boba. And the line out the door." (Yellow Bee — lists what they actually sell)
- "The grill stays on. The room stays loud. The banchan keeps coming." (kinetic, three short clauses)

BAD hero headlines (avoid):
- "The Best Korean BBQ in Seattle" (every restaurant claims best — unfalsifiable, generic)
- "Welcome to Do Si!" (welcome-mat copy reads like a 2003 site)
- "Premier Dining Experience" (corporate marketing-speak)
- "Where Friends Become Family" (Hallmark cliche)
- "Authentic. Fresh. Delicious." (three adjectives = no information)

Rules:
- Name a specific NOUN or VERB (cuts, sizzle, banchan, the grill, table, cocktail) over adjectives
- 4-8 words is the sweet spot
- Avoid "best", "premier", "authentic", "experience", "welcome to"
- Personality > polish — a slightly weird headline beats a polished cliche

## Subheads

GOOD:
- "Two locations, table-grill dining, premium AYCE — and a waterfront view in West Seattle."
- "Made every morning since 2008. Closed Sundays. Always worth the line."

BAD:
- "We pride ourselves on quality and service" (about us, not them)
- "Our team is dedicated to delivering exceptional experiences" (boilerplate)

Rules:
- Subheads tell the reader what's true and where, in plain language
- Hours, locations, age of the business, signature item — concrete facts beat adjectives

## About section

GOOD opening lines for about pages:
- "Do Si is built on a simple idea: Korean BBQ is best shared." (premise-first)
- "Mom started baking croissants at 4 a.m. in 2011. We still do." (specific moment)
- "We opened on a corner where nobody else wanted to open." (anti-establishment honesty)

BAD:
- "Founded in 2015, [Restaurant] has been serving the community with passion and dedication" (timeline obituary)
- "Our mission is to create memorable dining experiences for every guest" (vision-statement vacuum)

Rules:
- Open with a specific image, person, or premise — never a date
- Two or three short paragraphs > one long one
- Names of real people > "our team"
- "We" beats "the restaurant"

## FAQ answers

GOOD:
- Q: How long is AYCE? A: 90 minutes per table. Your server starts the timer when you order.
- Q: Walk-ins? A: Always welcome. Weekends fill by 6:30 — call ahead for groups of 4+.
- Q: Parking? A: Kent: ample on-site lot. Alki: street parking only — leave 10 extra minutes Friday/Saturday nights.

BAD:
- Q: Do you take walk-ins? A: Yes, we welcome both reservations and walk-ins at our establishment. (corporate speak)
- Q: Is parking available? A: Yes, parking is available at both of our locations. (zero-info answer)

Rules:
- One sentence answer + a specific factual qualifier
- Concrete numbers (90 min, 6:30, four-plus)
- The voice is "knowledgeable friend at the bar," not customer service

## Voice + tone

A restaurant's voice should sound like the chef or owner, not an agency. Tells:
- Use specific food/drink/method nouns the team uses naturally
- Avoid superlatives (best, finest, most authentic)
- Avoid stock phrases (our passion, our commitment, every detail)
- Avoid em-dashes for drama; use periods. Short sentences land harder.
- A chef's voice has rhythm — vary clause length

## Design system choices that signal "world-class"

Restaurant categories → design moves:
- KBBQ / steakhouse / loud-group → bold display, dark surface, red accent, sharp/subtle radius, photo natural
- Fine dining / hotel / Michelin → editorial serif, airy density, sharp radius, cream surface, low motion
- Cafe / bakery / artisan → warm serif (Fraunces), soft radius, cream surface, medium type weight
- Brewery / fast-casual → geometric sans (Space Grotesk), subtle radius, balanced density
- Cocktail bar / omakase → luxe, dark surface, gold accent, classic serif, duotone photos, sharp radius
- Boba / casual / playful → bright primary, pillowy radius, lively motion, rounded sans
- Sports bar / late-night → high-contrast bold sans (Oswald), dense layout, dark surface

Pillar choices:
- Surface dark = drama / occasion / night
- Surface cream = warmth / craft / artisan
- Surface light = modern / minimal / boutique
- Sharp radius = classic / luxury / serious
- Pillowy radius = playful / approachable / kids
- Density airy = upscale signal
- Density dense = editorial / utilitarian
- Motion lively = young / casual
- Motion subtle = adult / serious

## Sectional restraint

Cut anything that doesn't earn its place. Empty stat band beats a stat band of meaningless numbers. Empty FAQs beat 10 FAQs nobody asked. The site is shorter than you think it should be.
`.trim()

/**
 * Strategic-thinking prefix — forces Claude to reason about design intent
 * before writing copy. Goes BEFORE the JSON output instruction in the
 * system prompt.
 */
export const STRATEGY_FIRST_INSTRUCTION = `
Before writing JSON, think through the strategy in plain text inside a single <strategy>...</strategy> block. Cover briefly:
1. WHO this site is for (specific customer types from the brief)
2. WHAT promise the hero must deliver in 4-8 words
3. THE MOOD the design system should communicate (one phrase)
4. THE THREE most differentiating things to surface visually
5. WHAT TO LEAVE OUT — what NOT to include because it dilutes

Then output the final JSON. The strategy block is your reasoning — the JSON must reflect it.
`.trim()

/**
 * Variant generation prompt — produces N distinct directions in one call,
 * each with its own strategy.
 */
export function variantInstruction(n: number): string {
  return `
Generate ${n} DISTINCT design directions. Each variant must have a different strategy + mood. Don't generate three near-identical takes — push the variants apart on at least one axis (e.g. "warm artisan" vs "minimal editorial" vs "energetic playful").

Output strict JSON in this shape:
{
  "variants": [
    { "strategy": "<one-paragraph rationale>", "site": <RestaurantSite partial> },
    { "strategy": "...", "site": ... },
    ${n >= 3 ? '{ "strategy": "...", "site": ... }' : ''}
  ]
}
`.trim()
}
