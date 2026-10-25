-- Apply once with Supabase SQL Editor or `supabase db push`.
create type public.content_status as enum ('draft', 'published', 'archived');

create table public.archive_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  storage_key text unique,
  source_url text,
  thumbnail_url text,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size bigint not null check (byte_size >= 0),
  checksum text,
  variants jsonb not null default '{}',
  processing_status text not null default 'ready' check (processing_status in ('processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(storage_key, source_url) = 1),
  check (source_url is null or source_url ~ '^https://'),
  check (storage_key is null or storage_key ~ '^books/[a-zA-Z0-9_-]+/'),
  check (jsonb_typeof(variants) = 'object')
);
create table public.books (
  id text primary key default gen_random_uuid()::text,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 160),
  short_title text not null check (length(short_title) between 1 and 80),
  committee_name text not null default '',
  description text not null default '',
  status public.content_status not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  cover_asset_id uuid references public.assets(id) on delete restrict,
  spine_asset_id uuid references public.assets(id) on delete restrict,
  back_asset_id uuid references public.assets(id) on delete restrict,
  physical_height double precision not null default 2.15 check (physical_height between 1.5 and 2.5),
  physical_thickness double precision not null default 0.24 check (physical_thickness between 0.12 and 0.4),
  presentation_variant integer not null default 0 check (presentation_variant between -2 and 2),
  cover_color text not null default '#103d32',
  accent_color text not null default '#f0cd36',
  ink_color text not null default '#f5f1e7',
  motif text not null default 'lattice',
  quote text not null default '',
  quote_by text not null default '',
  living boolean not null default false,
  legacy_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.archives (
  id uuid primary key default gen_random_uuid(),
  book_id text not null unique references public.books(id) on delete cascade,
  title text not null,
  description text not null default '',
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sections (
  id text primary key default gen_random_uuid()::text,
  archive_id uuid not null references public.archives(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legacy_id text,
  title text not null check (length(title) between 1 and 160),
  sort_order integer not null default 0,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (archive_id, slug)
);
create table public.photos (
  id text primary key default gen_random_uuid()::text,
  section_id text not null references public.sections(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  alt text not null default '',
  caption text not null default '',
  credit text not null default '',
  credit_url text not null default '' check (credit_url = '' or credit_url ~ '^https?://'),
  sort_order integer not null default 0,
  status public.content_status not null default 'draft',
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index books_public_order on public.books(status, sort_order, id);
create index archives_book_status on public.archives(book_id, status);
create index sections_archive_order on public.sections(archive_id, status, sort_order, id);
create index photos_section_order on public.photos(section_id, status, sort_order, id);
create index photos_asset on public.photos(asset_id);
create index books_cover_asset on public.books(cover_asset_id);
create index books_spine_asset on public.books(spine_asset_id);
create index books_back_asset on public.books(back_asset_id);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare entity text; begin
  foreach entity in array array['books', 'archives', 'sections', 'photos', 'assets'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', entity);
  end loop;
end $$;

-- Membership can only be granted from SQL/service-role provisioning, never by an Auth user.
create function public.is_archive_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.archive_admins where user_id = auth.uid());
$$;
create function public.is_book_public(book_id text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.books b join public.archives a on a.book_id = b.id
    where b.id = $1 and b.status = 'published' and a.status = 'published');
$$;
create function public.is_section_public(section_id text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sections s join public.archives a on a.id = s.archive_id
    where s.id = $1 and s.status = 'published' and public.is_book_public(a.book_id));
$$;
create function public.is_asset_public(asset_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.assets a where a.id = $1 and a.processing_status = 'ready' and (
    exists(select 1 from public.books b where $1 in (b.cover_asset_id, b.spine_asset_id, b.back_asset_id) and public.is_book_public(b.id))
    or exists(select 1 from public.photos p where p.asset_id = $1 and p.status = 'published' and public.is_section_public(p.section_id))
  ));
$$;
create function public.can_read_storage_object(object_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_archive_admin() or exists(select 1 from public.assets a
    where public.is_asset_public(a.id) and (
      a.storage_key = $1 or exists(select 1 from jsonb_each(a.variants) v where v.value->>'storage_key' = $1)
    ));
$$;

alter table public.archive_admins enable row level security;
create policy admin_membership_read on public.archive_admins for select to authenticated using (user_id = auth.uid());
revoke all on public.archive_admins from anon, authenticated;
grant select on public.archive_admins to authenticated;
do $$ declare entity text; begin
  foreach entity in array array['books', 'archives', 'sections', 'photos', 'assets'] loop
    execute format('alter table public.%I enable row level security', entity);
    execute format('create policy admin_manage on public.%I for all to authenticated using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()))', entity);
    execute format('revoke all on public.%I from anon, authenticated', entity);
    execute format('grant select on public.%I to anon', entity);
    execute format('grant select, insert, update, delete on public.%I to authenticated', entity);
  end loop;
end $$;
create policy published_books on public.books for select to anon, authenticated using (public.is_book_public(id));
create policy published_archives on public.archives for select to anon, authenticated using (status = 'published' and public.is_book_public(book_id));
create policy published_sections on public.sections for select to anon, authenticated using (public.is_section_public(id));
create policy published_photos on public.photos for select to anon, authenticated using (status = 'published' and public.is_section_public(section_id));
create policy published_assets on public.assets for select to anon, authenticated using (public.is_asset_public(id));

-- Multi-row changes run atomically, with an explicit admin check as well as RLS.
create function public.create_archive_book(payload jsonb) returns text language plpgsql security invoker set search_path = '' as $$
declare new_id text;
begin
  if not public.is_archive_admin() then raise insufficient_privilege; end if;
  insert into public.books(slug, title, short_title, committee_name, description, sort_order, physical_height, physical_thickness, presentation_variant)
  values(payload->>'slug', payload->>'title', payload->>'short_title', coalesce(payload->>'committee_name',''), coalesce(payload->>'description',''),
    coalesce((payload->>'sort_order')::integer,0), coalesce((payload->>'physical_height')::double precision,2.15),
    coalesce((payload->>'physical_thickness')::double precision,0.24), coalesce((payload->>'presentation_variant')::integer,0)) returning id into new_id;
  insert into public.archives(book_id, title, description) values(new_id, payload->>'title', coalesce(payload->>'committee_name',''));
  return new_id;
end $$;
create function public.set_book_status(book_id text, new_status public.content_status, include_drafts boolean default false) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_archive_admin() then raise insufficient_privilege; end if;
  perform 1 from public.books where id = $1 for update;
  if not found then raise exception 'Book not found'; end if;
  update public.books set status = $2, published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end where id = $1;
  update public.archives set status = $2 where archives.book_id = $1;
  if $2 = 'published' and $3 then
    update public.sections set status = 'published' where status = 'draft' and archive_id in (select id from public.archives where archives.book_id = $1);
    update public.photos set status = 'published' where status = 'draft' and section_id in (
      select s.id from public.sections s join public.archives a on a.id = s.archive_id where a.book_id = $1 and s.status = 'published'
    );
  end if;
end $$;
create function public.move_archive_item(entity text, item_id text, before_id text default null) returns void language plpgsql security invoker set search_path = '' as $$
declare ids text[]; parent_id text; reordered text[]; insertion integer;
begin
  if not public.is_archive_admin() then raise insufficient_privilege; end if;
  -- Serialize order edits across every application instance, including paginated lists.
  perform pg_advisory_xact_lock(9272601);
  if $1 = 'books' then select array_agg(id order by sort_order,id) into ids from public.books;
  elsif $1 = 'sections' then
    select archive_id::text into parent_id from public.sections where id = $2;
    select array_agg(id order by sort_order,id) into ids from public.sections where archive_id::text = parent_id;
  elsif $1 = 'photos' then
    select section_id into parent_id from public.photos where id = $2;
    select array_agg(id order by sort_order,id) into ids from public.photos where section_id = parent_id;
  else raise exception 'Invalid collection'; end if;
  if ids is null or not ($2 = any(ids)) or ($3 is not null and not ($3 = any(ids))) then raise exception 'Invalid reorder scope'; end if;
  if $2 = $3 then return; end if;
  reordered := array_remove(ids, $2);
  insertion := case when $3 is null then cardinality(reordered)+1 else array_position(reordered,$3) end;
  reordered := coalesce(reordered[1:insertion-1], '{}') || array[$2] || coalesce(reordered[insertion:cardinality(reordered)], '{}');
  if $1 = 'books' then update public.books b set sort_order = ranked.ordinality * 10 from unnest(reordered) with ordinality ranked(id,ordinality) where b.id = ranked.id;
  elsif $1 = 'sections' then update public.sections s set sort_order = ranked.ordinality * 10 from unnest(reordered) with ordinality ranked(id,ordinality) where s.id = ranked.id;
  else update public.photos p set sort_order = ranked.ordinality * 10 from unnest(reordered) with ordinality ranked(id,ordinality) where p.id = ranked.id;
  end if;
end $$;
create function public.attach_archive_photo(section_id text, asset_id uuid, photo_alt text) returns text language plpgsql security invoker set search_path = '' as $$
declare new_id text; next_order integer;
begin
  if not public.is_archive_admin() then raise insufficient_privilege; end if;
  perform 1 from public.sections where id = $1 for update;
  if not found then raise exception 'Section not found'; end if;
  select coalesce(max(sort_order),0)+10 into next_order from public.photos where photos.section_id = $1;
  insert into public.photos(section_id,asset_id,alt,sort_order) values($1,$2,$3,next_order) returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.touch_updated_at(), public.is_archive_admin(), public.is_book_public(text), public.is_section_public(text), public.is_asset_public(uuid), public.can_read_storage_object(text), public.create_archive_book(jsonb), public.set_book_status(text,public.content_status,boolean), public.move_archive_item(text,text,text), public.attach_archive_photo(text,uuid,text) from public, anon, authenticated;
grant execute on function public.is_archive_admin(), public.is_book_public(text), public.is_section_public(text), public.is_asset_public(uuid), public.can_read_storage_object(text) to anon, authenticated;
grant execute on function public.create_archive_book(jsonb), public.set_book_status(text,public.content_status,boolean), public.move_archive_item(text,text,text), public.attach_archive_photo(text,uuid,text) to authenticated;
grant all on public.archive_admins, public.books, public.archives, public.sections, public.photos, public.assets to service_role;
grant execute on function public.touch_updated_at(), public.is_archive_admin(), public.is_book_public(text), public.is_section_public(text), public.is_asset_public(uuid), public.can_read_storage_object(text), public.create_archive_book(jsonb), public.set_book_status(text,public.content_status,boolean), public.move_archive_item(text,text,text), public.attach_archive_photo(text,uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('archive-assets','archive-assets',false,33554432,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy archive_storage_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'archive-assets' and public.can_read_storage_object(name));
create policy archive_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'archive-assets' and public.is_archive_admin() and name ~ '^books/[a-zA-Z0-9_-]+/');
create policy archive_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'archive-assets' and public.is_archive_admin())
  with check (bucket_id = 'archive-assets' and public.is_archive_admin() and name ~ '^books/[a-zA-Z0-9_-]+/');
create policy archive_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'archive-assets' and public.is_archive_admin());
