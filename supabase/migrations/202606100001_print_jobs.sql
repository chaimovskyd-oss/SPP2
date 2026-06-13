-- SPP2 Print Hub — cross-machine job STATUS/metadata (Phase 2). The Print Hub server is the only
-- writer of real job state; design stations on the same account read it for a live cross-machine
-- queue. NO image bytes are stored here — pixels stay on the LAN / local hub folder.
-- Apply only to the dedicated staging project until proven.

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  source_computer text,
  target_computer text,
  customer_name text,
  size text,
  finish text,
  border_mode text,
  copies integer not null default 1 check (copies >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  state text not null default 'incoming',
  error text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists print_jobs_user_updated_idx
  on public.print_jobs (user_id, updated_at desc);

alter table public.print_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'print_jobs' and policyname = 'print_jobs_select_own'
  ) then
    create policy print_jobs_select_own on public.print_jobs
      for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'print_jobs' and policyname = 'print_jobs_insert_own'
  ) then
    create policy print_jobs_insert_own on public.print_jobs
      for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'print_jobs' and policyname = 'print_jobs_update_own'
  ) then
    create policy print_jobs_update_own on public.print_jobs
      for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create or replace function public.set_print_jobs_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_print_jobs_updated_at on public.print_jobs;
create trigger set_print_jobs_updated_at
  before update on public.print_jobs
  for each row execute function public.set_print_jobs_updated_at();

grant select, insert, update on public.print_jobs to authenticated;
