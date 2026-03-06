-- ============================================================
--  Deskly CRM - Automations Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ============================================================
--  TABLE: automations
--  One row per (user, automation_type) - stores enabled state
-- ============================================================
create table if not exists public.automations (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  automation_type   text not null,
  enabled           boolean not null default false,
  config            jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  unique (user_id, automation_type)
);

create index if not exists automations_user_id_idx on public.automations(user_id);

-- RLS
alter table public.automations enable row level security;

create policy "automations: select own"
  on public.automations for select
  using (auth.uid() = user_id);

create policy "automations: insert own"
  on public.automations for insert
  with check (auth.uid() = user_id);

create policy "automations: update own"
  on public.automations for update
  using (auth.uid() = user_id);

create policy "automations: delete own"
  on public.automations for delete
  using (auth.uid() = user_id);


-- ============================================================
--  TABLE: notifications
--  In-app notification inbox per user
-- ============================================================
create table if not exists public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  body       text,
  link_to    text,           -- optional relative URL to navigate on click
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx      on public.notifications(user_id);
create index if not exists notifications_user_read_idx    on public.notifications(user_id, read);
create index if not exists notifications_created_at_idx   on public.notifications(created_at desc);

-- RLS
alter table public.notifications enable row level security;

create policy "notifications: select own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications: insert own"
  on public.notifications for insert
  with check (auth.uid() = user_id);

create policy "notifications: update own"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "notifications: delete own"
  on public.notifications for delete
  using (auth.uid() = user_id);


-- ============================================================
--  ALTER: deals - add archived column for auto-archive
-- ============================================================
alter table public.deals
  add column if not exists archived boolean not null default false;

create index if not exists deals_archived_idx on public.deals(archived);
