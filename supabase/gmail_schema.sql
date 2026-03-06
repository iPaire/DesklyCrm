-- ============================================================
--  Deskly CRM - Gmail Integration Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ============================================================
--  TABLE: gmail_connections
--  One row per user - stores OAuth tokens for Gmail sync
-- ============================================================
create table if not exists public.gmail_connections (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  gmail_email   text not null,
  refresh_token text not null default '',
  access_token  text,
  token_expiry  timestamptz,
  connected_at  timestamptz not null default now(),
  last_sync     timestamptz,
  unique (user_id)
);

create index if not exists gmail_connections_user_id_idx on public.gmail_connections(user_id);

-- RLS
alter table public.gmail_connections enable row level security;

create policy "gmail_connections: select own"
  on public.gmail_connections for select
  using (auth.uid() = user_id);

create policy "gmail_connections: insert own"
  on public.gmail_connections for insert
  with check (auth.uid() = user_id);

create policy "gmail_connections: update own"
  on public.gmail_connections for update
  using (auth.uid() = user_id);

create policy "gmail_connections: delete own"
  on public.gmail_connections for delete
  using (auth.uid() = user_id);


-- ============================================================
--  ENUM: email_direction
-- ============================================================
do $$ begin
  create type email_direction as enum ('sent', 'received');
exception when duplicate_object then null;
end $$;


-- ============================================================
--  TABLE: email_logs
--  Stores synced emails linked to CRM contacts
-- ============================================================
create table if not exists public.email_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  contact_id        uuid references public.contacts(id) on delete set null,
  gmail_message_id  text not null,
  thread_id         text,
  subject           text,
  from_email        text,
  to_email          text,
  body_preview      text,         -- first 200 chars of plain text
  body_full         text,         -- full HTML or plain text body
  received_at       timestamptz,
  direction         email_direction not null default 'received',
  created_at        timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

create index if not exists email_logs_user_id_idx    on public.email_logs(user_id);
create index if not exists email_logs_contact_id_idx on public.email_logs(contact_id);
create index if not exists email_logs_received_at_idx on public.email_logs(received_at desc);
create index if not exists email_logs_thread_id_idx  on public.email_logs(thread_id);

-- RLS
alter table public.email_logs enable row level security;

create policy "email_logs: select own"
  on public.email_logs for select
  using (auth.uid() = user_id);

create policy "email_logs: insert own"
  on public.email_logs for insert
  with check (auth.uid() = user_id);

create policy "email_logs: update own"
  on public.email_logs for update
  using (auth.uid() = user_id);

create policy "email_logs: delete own"
  on public.email_logs for delete
  using (auth.uid() = user_id);
