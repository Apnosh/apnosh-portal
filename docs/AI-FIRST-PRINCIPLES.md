# AI-First Principles

Apnosh is being built so every piece of work the system touches makes
the next piece better. Humans set direction and judge quality. AI does
the volume work and learns from every judgment. The data layer is the
compounding asset.

These principles are non-negotiable. Every new surface, table, or
feature in this codebase must obey them. If a PR can't, it needs an
explicit exemption documented in the PR description.

---

## 1. Provenance everywhere

Every artifact (post idea, draft, caption, quote, theme, decision)
records its full lineage:

- **Who** created it (`person_id`)
- **How** it was created (`proposed_via`: 'strategist' | 'copywriter' | 'designer' | 'ai' | 'client_request')
- **From what** — links to source theme, brief, prior version, or AI generation
- **When** it happened (timestamp + version stamp of the brand voice / theme it referenced)

**In code:** every new content-bearing table needs `proposed_by`,
`proposed_via`, `ai_generation_ids[]` (nullable array), `source_*_id`
foreign keys to whatever fed it. If you find yourself adding a new
table without these, stop and add them.

## 2. Outcomes everywhere

Every artifact gets metrics attached after it ships. Performance feeds
back as signal. A draft has no outcomes; a published post has reach,
engagement, sentiment, conversion. Backfill outcomes onto the draft
ledger so we can train on "this idea + this caption → these results."

**In code:** when a `content_draft` transitions to `published`, its
`published_post_id` is set and that post's metrics (already on
`social_posts`) are joinable. Never lose the link.

## 3. Human judgment is gold

Every approve / revise / reject of an AI output records a reason — at
minimum a one-tap tag, ideally a short note. The judgment table is the
training data we can't replicate.

**In code:** UI surfaces that show AI-generated content always have:
- One-tap approve (`reason_tags = ['perfect']` shorthand)
- Tag-required revise (forced choice: 'tone', 'angle', 'off_brand',
  'too_long', 'too_short', 'wrong_audience', 'other')
- Optional free-text reason
- All three write to `human_judgments`

Don't ship UIs that let strategists silently revise AI output.

## 4. Versioned context

Brand voice docs, editorial themes, briefs, and brand guidelines are
versioned. When an AI generation runs against a brand voice doc, it
records the version (`brand_voice_v3.2` not just `brand_voice`). Later
analysis can say "v3.2 outperformed v3.1 by N%."

**In code:** any document that AI conditions on gets a `version` int
that bumps on update. Generations record the version used.

## 5. Quality gate at every step

AI is never the last step. Every pipeline is:

```
AI generates → human approves → human produces → human approves → measure outcome
```

The human gates are non-optional. AI confidence routing decides who
the next human is (strategist vs. specialist vs. AM) but a human
always closes the loop before client-facing publish.

**In code:** any auto-publish path is forbidden unless explicitly
flagged as "low-risk auto" (e.g., auto-reply to a generic positive
review). Default: pause for human approval.

## 6. Retrieval-aware generation

Before any AI run, the system retrieves relevant context:

- Top 10 best-performing past posts/captions for this client
- Active `client_knowledge_facts` (structured KB)
- Last 3 editorial themes + their pillars
- Brand voice samples (last 5 approved captions)
- Similar successful clients (cross-client patterns)

AI generates WITH this context, not blind to it.

**In code:** every AI helper (`suggest-quote`, `suggest-reply`,
`generate-caption`, etc.) starts with a `getClientContext(clientId)`
call that pulls the above. New helpers must follow this template; no
"prompt-only" AI calls.

## 7. Cross-client learning

Anonymized successful patterns surface in suggestions. As we add
clients, the network effect compounds. "Restaurants similar to this
one who launched a Tuesday special saw a 30% lift" is exactly the kind
of insight a 10K-client agency can offer that a solo strategist can't.

**In code:** `cross_client_patterns` is a materialized view refreshed
on a schedule. AI helpers can opt into "include cross-client signal"
context with anonymization (client names stripped, only stats).

## 8. All role interactions logged

Not just AI runs — every meaningful human action gets a row. When a
strategist clicks "use this idea," when a copywriter edits an AI
draft, when a designer picks a visual direction. Capture the delta
between AI output and human final, because that delta IS the training
signal.

**In code:** `human_judgments` covers approve/revise. We also need
`content_revisions` (each save of a draft is a row) and
`person_actions` (each click of a high-signal CTA). The cost is small;
the compounding value is enormous.

---

## Tables that implement these principles

| Table | Principle(s) | Notes |
|---|---|---|
| `agent_runs` | 1, 2 | AI invocations with input/output/cost. EXISTS. |
| `social_posts` | 1, 2 | Performance metrics. EXISTS. Add provenance cols in migration 107. |
| `editorial_themes` | 1, 4 | Editorial intent. EXISTS. Add version. |
| `client_brands` | 4 | Brand voice + visual. EXISTS. Add version. |
| `client_patterns` | 7 | Patterns per client. EXISTS. |
| `client_knowledge_facts` | 1, 6 | Structured KB. NEW in 107. |
| `content_drafts` | 1, 2, 3, 5 | Idea→publish ledger. NEW in 107. |
| `human_judgments` | 3 | Reasons captured. NEW in 107. |
| `content_revisions` | 8 | Diff history. NEW in 107. |
| `cross_client_patterns` | 7 | Materialized view. NEW post-107. |

---

## Reviewing a PR against these principles

Ask:

1. Does this new artifact have provenance fields?
2. Will outcomes ever attach to this? How?
3. If a human approves/revises this, where does the reason go?
4. If this conditions on a document, is the document version tracked?
5. Is there an auto-publish path? Should there be a human gate?
6. If AI generates this, does it run with context (not blind)?
7. Could this surface a cross-client pattern? Should it?
8. Are role-member interactions with this captured?

If any answer is "no" or "I don't know," that's the conversation in
the PR.

---

## Out of scope (not principles)

These are good engineering, just not the AI-compounding architecture:

- Test coverage, types, build hygiene — separate standard
- Performance / caching — separate standard
- RLS scope — separate standard (covered in migrations)
- UI design / accessibility — separate standard

Don't conflate "we should write tests" with "we should capture human
judgments." Both matter, but the principles in this doc are about the
specific decision to make Apnosh's data layer compound over time.
