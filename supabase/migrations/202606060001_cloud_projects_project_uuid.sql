alter table public.cloud_projects
  add column if not exists project_uuid text;

create index if not exists cloud_projects_user_project_uuid_idx
  on public.cloud_projects (user_id, project_uuid)
  where deleted_at is null and project_uuid is not null;
