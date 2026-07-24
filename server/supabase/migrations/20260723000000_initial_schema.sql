-- ============================================================
-- Migration: 20260723000000_initial_schema.sql
-- Creates the leads table with enums, triggers, and RLS policies
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Enum: website_quality ───────────────────────────────────────────────────
do $$ begin
  create type website_quality as enum (
    'good',
    'average',
    'poor',
    'broken',
    'unassessed'
  );
exception
  when duplicate_object then null;
end $$;

-- ─── Enum: lead_status ───────────────────────────────────────────────────────
do $$ begin
  create type lead_status as enum (
    'not_contacted',
    'contacted',
    'interested',
    'dead',
    'converted'
  );
exception
  when duplicate_object then null;
end $$;

-- ─── Table: leads ────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id                    uuid primary key default uuid_generate_v4(),
  lead_number           text unique,                        -- auto-set by trigger, e.g. "L0001"
  business_name         text not null,
  category              text not null,
  city_area             text not null,
  phone                 text,
  has_website           boolean not null default false,
  website_url           text,
  website_quality       website_quality not null default 'unassessed',
  website_quality_notes text,
  google_maps_link      text,
  google_rating         numeric(3, 1),
  review_count          text,
  place_id              text unique,                        -- Google Places ID, dedupe key (nullable for legacy)
  lead_status           lead_status not null default 'not_contacted',
  outreach_stage        text,
  notes                 text,
  draft_message         text,
  date_found            timestamptz not null default now(),
  last_contacted_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── Trigger: auto-increment lead_number ────────────────────────────────────
-- Generates values like L0001, L0002, … L9999, L10000
create sequence if not exists lead_number_seq start 1;

create or replace function generate_lead_number()
returns trigger language plpgsql as $$
declare
  next_val bigint;
begin
  if new.lead_number is null then
    next_val := nextval('lead_number_seq');
    new.lead_number := 'L' || lpad(next_val::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_number on public.leads;
create trigger trg_lead_number
  before insert on public.leads
  for each row execute function generate_lead_number();

-- ─── Trigger: updated_at ─────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.leads enable row level security;

-- Policy: service-role always bypasses RLS (no explicit policy needed).
-- Policy: allow all for authenticated users — tighten to specific auth.uid()
-- when multi-user auth is added.
create policy "Authenticated users can read leads"
  on public.leads for select
  using (true);

create policy "Authenticated users can insert leads"
  on public.leads for insert
  with check (true);

create policy "Authenticated users can update leads"
  on public.leads for update
  using (true);

create policy "Authenticated users can delete leads"
  on public.leads for delete
  using (true);

-- ─── Index ───────────────────────────────────────────────────────────────────
create index if not exists idx_leads_place_id     on public.leads (place_id);
create index if not exists idx_leads_lead_status  on public.leads (lead_status);
create index if not exists idx_leads_category     on public.leads (category);
create index if not exists idx_leads_created_at   on public.leads (created_at desc);
