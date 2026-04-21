-- ============================================================
-- Migration 062: multi-folder Drive support per client
-- ============================================================
-- The initial Drive integration (migration 061) stored a single
-- drive_folder_id column on clients. Agencies typically want several
-- folders per client (brand assets, contracts, content deliverables).
-- Move that into a proper many-to-one table with labels + sort order.
--
-- Leaves clients.drive_folder_id + drive_folder_url in place for
-- backward compatibility; new code reads from client_drive_folders
-- exclusively. Existing single-folder links are migrated forward.
-- ============================================================

create table client_drive_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  folder_id text not null,
  folder_url text,
  -- Human label like "Brand assets" or "Contracts". Optional; falls
  -- back to the Drive folder name when empty.
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A given Drive folder should only be linked once per client.
  unique(client_id, folder_id)
);

create index idx_client_drive_folders_client on client_drive_folders(client_id);

alter table client_drive_folders enable row level security;

create policy "admin full access on client_drive_folders"
  on client_drive_folders for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Migrate any existing single-folder links forward. Gives them a
-- default "Main folder" label so the UI has something to render.
insert into client_drive_folders (client_id, folder_id, folder_url, label)
select id, drive_folder_id, drive_folder_url, 'Main folder'
from clients
where drive_folder_id is not null
on conflict (client_id, folder_id) do nothing;
