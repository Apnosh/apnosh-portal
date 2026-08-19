-- 243: clients.posting_pref — the remembered Send-off choice (SO-1).
-- 'auto' = we post it (AI caption, owner approves) · 'human' = someone posts it
-- · 'self' = they post it themselves. Saved on first choice, changeable on any
-- piece (owner call 2026-08-19: remember it, never lock it).
alter table clients add column if not exists posting_pref text
  check (posting_pref is null or posting_pref in ('auto', 'human', 'self'));
