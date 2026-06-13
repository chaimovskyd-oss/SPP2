alter table public.cloud_projects
  add column if not exists storage_provider text not null default 'supabase';

update public.cloud_projects
set storage_provider = 'b2'
where deleted_at is null
  and project_uuid is not null;

create index if not exists cloud_projects_user_provider_updated_idx
  on public.cloud_projects (user_id, storage_provider, updated_at desc)
  where deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cloud_projects_storage_provider_check'
      and conrelid = 'public.cloud_projects'::regclass
  ) then
    alter table public.cloud_projects
      add constraint cloud_projects_storage_provider_check
      check (storage_provider in ('supabase', 'b2', 'r2'));
  end if;
end $$;
