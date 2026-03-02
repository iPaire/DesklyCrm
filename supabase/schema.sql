-- ============================================================
--  Deskly CRM - Database Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ============================================================
--  EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";


-- ============================================================
--  HELPER: auto-update updated_at on every row change
-- ============================================================
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================
--  TABLE: contacts
-- ============================================================
create table if not exists public.contacts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contacts_user_id_idx on public.contacts(user_id);
create index if not exists contacts_email_idx   on public.contacts(email);

create trigger set_contacts_updated_at
  before update on public.contacts
  for each row execute function handle_updated_at();

-- RLS
alter table public.contacts enable row level security;

create policy "contacts: select own"
  on public.contacts for select
  using (auth.uid() = user_id);

create policy "contacts: insert own"
  on public.contacts for insert
  with check (auth.uid() = user_id);

create policy "contacts: update own"
  on public.contacts for update
  using (auth.uid() = user_id);

create policy "contacts: delete own"
  on public.contacts for delete
  using (auth.uid() = user_id);


-- ============================================================
--  TABLE: deals
-- ============================================================
create type deal_stage as enum (
  'lead',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost'
);

create table if not exists public.deals (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  name        text not null,
  value       decimal(12, 2) not null default 0,
  stage       deal_stage not null default 'lead',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists deals_user_id_idx    on public.deals(user_id);
create index if not exists deals_contact_id_idx on public.deals(contact_id);
create index if not exists deals_stage_idx      on public.deals(stage);

create trigger set_deals_updated_at
  before update on public.deals
  for each row execute function handle_updated_at();

-- RLS
alter table public.deals enable row level security;

create policy "deals: select own"
  on public.deals for select
  using (auth.uid() = user_id);

create policy "deals: insert own"
  on public.deals for insert
  with check (auth.uid() = user_id);

create policy "deals: update own"
  on public.deals for update
  using (auth.uid() = user_id);

create policy "deals: delete own"
  on public.deals for delete
  using (auth.uid() = user_id);


-- ============================================================
--  TABLE: tasks
-- ============================================================
create table if not exists public.tasks (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  deal_id     uuid references public.deals(id) on delete set null,
  title       text not null,
  due_date    date,
  completed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_user_id_idx    on public.tasks(user_id);
create index if not exists tasks_contact_id_idx on public.tasks(contact_id);
create index if not exists tasks_deal_id_idx    on public.tasks(deal_id);
create index if not exists tasks_due_date_idx   on public.tasks(due_date);
create index if not exists tasks_completed_idx  on public.tasks(completed);

create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function handle_updated_at();

-- RLS
alter table public.tasks enable row level security;

create policy "tasks: select own"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "tasks: insert own"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "tasks: update own"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "tasks: delete own"
  on public.tasks for delete
  using (auth.uid() = user_id);
