-- SPP2 Cloud Projects staging schema.
-- Apply only to a dedicated staging project/branch until the cloud flow is proven.

create table if not exists public.cloud_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  file_name text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  storage_path text not null unique,
  device_name text,
  thumbnail_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cloud_projects_user_updated_idx
  on public.cloud_projects (user_id, updated_at desc)
  where deleted_at is null;

alter table public.cloud_projects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cloud_projects'
      and policyname = 'cloud_projects_select_own'
  ) then
    create policy cloud_projects_select_own on public.cloud_projects
      for select
      to authenticated
      using ((select auth.uid()) = user_id and deleted_at is null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cloud_projects'
      and policyname = 'cloud_projects_insert_own'
  ) then
    create policy cloud_projects_insert_own on public.cloud_projects
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cloud_projects'
      and policyname = 'cloud_projects_update_own'
  ) then
    create policy cloud_projects_update_own on public.cloud_projects
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create or replace function public.set_cloud_projects_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cloud_projects_updated_at on public.cloud_projects;
create trigger set_cloud_projects_updated_at
  before update on public.cloud_projects
  for each row execute function public.set_cloud_projects_updated_at();

grant select, insert, update on public.cloud_projects to authenticated;

