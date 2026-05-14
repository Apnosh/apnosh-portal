-- Microsoft Clarity integration: free heatmaps + session recordings
-- + form abandonment + rage click detection. Setup is a single
-- script tag the client adds to their site. We store the project ID
-- here so the portal can deep-link to the right Clarity dashboard.

alter table clients
  add column if not exists clarity_project_id text;

comment on column clients.clarity_project_id is
  'Microsoft Clarity project ID (10-char alphanumeric). Set once at setup; the portal uses it to deep-link to clarity.microsoft.com/projects/<id>.';

notify pgrst, 'reload schema';
