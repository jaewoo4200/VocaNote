create table if not exists public.sync_vaults (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.sync_vaults enable row level security;

create policy "sync_vaults_select_own"
on public.sync_vaults
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "sync_vaults_insert_own"
on public.sync_vaults
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "sync_vaults_update_own"
on public.sync_vaults
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create or replace function public.set_sync_vaults_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_sync_vaults_updated_at on public.sync_vaults;

create trigger trg_sync_vaults_updated_at
before update on public.sync_vaults
for each row
execute function public.set_sync_vaults_updated_at();
