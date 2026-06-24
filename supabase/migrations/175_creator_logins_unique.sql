-- One person per pool creator id. The creator-side authz gate matches the
-- logged-in user's creator_logins.creator_id against an order's creator_id; if
-- two auth users could both map to 'v_maya' they would share each other's
-- orders. This unique index makes a creator id claimable exactly once (a second
-- claim fails), so the gate is sound for the seeded-pool model.
--
-- The durable fix when the seeded pool becomes real vendors: bind each order to
-- an assignee person id at mint and gate on that instead of the pool string.

create unique index if not exists creator_logins_creator_unique on creator_logins (creator_id);
