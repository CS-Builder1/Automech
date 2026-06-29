-- Automech cloud sync schema.
-- All app data syncs through one generic, owner-scoped table; the client stores
-- each record's full JSON in `data` and uses `updated_at` for last-write-wins.

create table if not exists public.records (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  collection text        not null,
  id         text        not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  data       jsonb       not null,
  primary key (user_id, collection, id)
);

-- Pull queries filter by (user, collection, updated_at).
create index if not exists records_user_collection_updated_idx
  on public.records (user_id, collection, updated_at);

alter table public.records enable row level security;

drop policy if exists "records are private to their owner" on public.records;
create policy "records are private to their owner"
  on public.records for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Private bucket for inspection photos; objects are namespaced by user id folder.
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists "own media" on storage.objects;
create policy "own media"
  on storage.objects for all
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
