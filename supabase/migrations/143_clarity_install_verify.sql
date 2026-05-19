-- Track whether the Microsoft Clarity tracking snippet is actually
-- installed on the client's website. The setup wizard previously
-- marked Clarity "Connected" the moment an owner pasted a project ID,
-- even though that ID is useless without the script tag being live
-- on the site.

alter table clients add column if not exists clarity_install_verified boolean;
alter table clients add column if not exists clarity_install_checked_at timestamptz;

comment on column clients.clarity_install_verified is
  'Whether the Clarity tracking snippet was last seen on the live site. '
  'null = never checked. true = snippet detected. false = checked + not found.';
comment on column clients.clarity_install_checked_at is
  'When verifyClarityInstallation last ran for this client.';
