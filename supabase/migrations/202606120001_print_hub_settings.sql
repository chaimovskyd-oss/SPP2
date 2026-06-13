-- SPP2 Print Hub shared settings.
-- Stores one JSON snapshot per user/account so another machine on the same cloud account can pull
-- printer profiles, station trust, media counters, LAN connection hints, and hub-level config.
-- No image/job bytes are stored here.

create table if not exists public.print_hub_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_name text not null default 'default',
  source_computer text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_name)
);

create index if not exists print_hub_settings_user_updated_idx
  on public.print_hub_settings (user_id, updated_at desc);

alter table public.print_hub_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'print_hub_settings' and policyname = 'print_hub_settings_select_own'
  ) then
    create policy print_hub_settings_select_own on public.print_hub_settings
      for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'print_hub_settings' and policyname = 'print_hub_settings_insert_own'
  ) then
    create policy print_hub_settings_insert_own on public.print_hub_settings
      for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'print_hub_settings' and policyname = 'print_hub_settings_update_own'
  ) then
    create policy print_hub_settings_update_own on public.print_hub_settings
      for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create or replace function public.set_print_hub_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_print_hub_settings_updated_at on public.print_hub_settings;
create trigger set_print_hub_settings_updated_at
  before update on public.print_hub_settings
  for each row execute function public.set_print_hub_settings_updated_at();

grant select, insert, update on public.print_hub_settings to authenticated;
