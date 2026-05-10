# Decision Log

Numbered, append-only record of meaningful decisions. ADR-style.

## Format

Each file: `NNNN-short-decision-title.md`. Numbered for ordering, not priority.

Each contains:
- **Date** — when decided
- **Status** — Accepted / Superseded by NNNN / Reversed
- **Decided by** — who approved
- **Context** — what triggered the decision
- **Decision** — what was decided (1–3 sentences)
- **Reasoning** — why
- **Alternatives considered** — what we ruled out and why
- **Consequences** — what this commits us to / costs us

## When to add a decision log

Yes:
- Strategic product calls (catalog size, scope, customer band)
- Architecture choices future engineers will ask about
- Vendor selections
- Cultural principles
- "We decided NOT to do X" calls — especially valuable a year later

No:
- Variable names, file paths, code-level details
- Decisions the spec already covers
- Reversible decisions of low consequence

## Index

| # | Title | Status |
|---|---|---|
| 0001 | Eight-goal catalog (not 10) | Accepted |
| 0002 | Decline-to-sell cultural principle | Accepted |
| 0003 | Goal layer precedes Q2 features | Accepted |
| 0004 | Always run the 6-point alignment check (no exemptions) | Accepted |
