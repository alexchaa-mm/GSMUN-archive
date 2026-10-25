-- REVIEW ONLY. NOT APPLIED. Owner approval + backup + schema inspection required.
-- Convert to a CLI-generated migration only after approval. Do not rerun the
-- original CMS migration. No catalogue, auth, storage or existing policy changes.
-- Deliberately no IF NOT EXISTS: an unexpected object must stop, not be hidden.
begin;
create table public.archive_navigation (
  key text primary key check (key in ('draft','published')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version integer not null check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.archive_navigation enable row level security;
revoke all on public.archive_navigation from anon, authenticated;
grant select on public.archive_navigation to anon;
grant select, insert, update, delete on public.archive_navigation to authenticated;
create policy navigation_admin on public.archive_navigation for all to authenticated
  using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()));
create policy navigation_published on public.archive_navigation for select to anon, authenticated
  using (key = 'published');

create table public.drive_folder_mappings (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  root_id text not null,
  book_id text not null references public.books(id) on delete cascade,
  section_id text not null references public.sections(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table public.drive_import_jobs (
  id uuid primary key,
  drive_file_id text not null unique check (drive_file_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  root_id text not null,
  parent_id text not null,
  folder_path jsonb not null check (jsonb_typeof(folder_path) = 'array'),
  filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  md5_checksum text not null default '',
  source_version text not null default '',
  status text not null check (status in ('queued','importing','imported','failed','deferred','duplicate','needs_mapping','unsupported','source_changed')),
  book_id text references public.books(id) on delete set null,
  section_id text references public.sections(id) on delete set null,
  upload_id uuid not null unique,
  asset_id uuid references public.assets(id) on delete set null,
  photo_id text references public.photos(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  error text not null default '',
  retry_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drive_jobs_pending on public.drive_import_jobs(root_id,status,created_at,id);
create index drive_jobs_retry on public.drive_import_jobs(root_id,status,retry_at,id);
create index drive_jobs_lease on public.drive_import_jobs(root_id,status,lease_expires_at,id);
create index drive_jobs_folder on public.drive_import_jobs(root_id,parent_id);
create index drive_mappings_book on public.drive_folder_mappings(book_id,section_id);
create table public.drive_sync_state (
  id text primary key check (id = 'main'),
  root_id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
-- Private import metadata never readable or writable by public/non-admin users.
alter table public.drive_folder_mappings enable row level security;
alter table public.drive_import_jobs enable row level security;
alter table public.drive_sync_state enable row level security;
revoke all on public.drive_folder_mappings, public.drive_import_jobs, public.drive_sync_state from anon, authenticated;
grant select, insert, update, delete on public.drive_folder_mappings, public.drive_import_jobs, public.drive_sync_state to authenticated;
create policy drive_mapping_admin on public.drive_folder_mappings for all to authenticated
  using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()));
create policy drive_job_admin on public.drive_import_jobs for all to authenticated
  using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()));
create policy drive_cursor_admin on public.drive_sync_state for all to authenticated
  using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()));
create trigger touch_updated_at before update on public.archive_navigation
  for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.drive_folder_mappings
  for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.drive_import_jobs
  for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.drive_sync_state
  for each row execute function public.touch_updated_at();
commit;
-- No INSERTs: settings and jobs are created by explicit authorized admin actions.
-- Rollback: disable Drive + roll back application first. Retain these tables and
-- stored originals; any later DROP/export/cleanup is a separate approved action.
