-- Order confirmation: a human on the Apnosh team reviews a freshly shipped campaign and takes it on.
-- Set once from /admin/campaign-orders; the owner's timeline then shows "Order confirmed · {date}"
-- and the stages start moving. Until confirmed, the timeline holds at "Your team is looking it over".
alter table campaigns add column if not exists confirmed_at timestamptz;

-- Grandfather every already-shipped campaign as confirmed at ship time, so existing timelines never
-- regress to "waiting for confirmation" for orders the team took on long ago.
update campaigns set confirmed_at = shipped_at where status = 'shipped' and confirmed_at is null and shipped_at is not null;
