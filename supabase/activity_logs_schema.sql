-- ============================================================
--  Deskly CRM - Activity Logs Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create table if not exists public.activity_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  type        text not null check (type in ('call', 'meeting', 'note', 'email')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists activity_logs_contact_id_idx on public.activity_logs(contact_id);
create index if not exists activity_logs_user_id_idx    on public.activity_logs(user_id);

-- RLS
alter table public.activity_logs enable row level security;

create policy "activity_logs: select own"
  on public.activity_logs for select
  using (auth.uid() = user_id);

create policy "activity_logs: insert own"
  on public.activity_logs for insert
  with check (auth.uid() = user_id);

create policy "activity_logs: delete own"
  on public.activity_logs for delete
  using (auth.uid() = user_id);
