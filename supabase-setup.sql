-- Marcapáginas: tabla para guardar tu biblioteca en la nube.
-- Pégalo completo en Supabase > SQL Editor > New query > Run.

create table if not exists public.library (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  rev        integer     not null default 0,
  updated_at timestamptz not null default now()
);

-- Cada persona solo puede ver y modificar su propia fila.
alter table public.library enable row level security;

drop policy if exists "library_select_own" on public.library;
drop policy if exists "library_insert_own" on public.library;
drop policy if exists "library_update_own" on public.library;

create policy "library_select_own" on public.library
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "library_insert_own" on public.library
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "library_update_own" on public.library
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
