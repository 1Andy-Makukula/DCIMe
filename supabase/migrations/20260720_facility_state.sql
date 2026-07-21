-- supabase/migrations/20260720_facility_state.sql

create table if not exists public.facility_states (
    site_uuid uuid primary key references public.sites(id) on delete cascade,
    fsm_mode text not null default 'NORMAL' check (fsm_mode = any (array['NORMAL'::text, 'DAILY_TEST'::text, 'OUTAGE'::text])),
    updated_at timestamptz default now(),
    updated_by uuid references public.employees(id) on delete set null
);

-- Enable RLS
alter table public.facility_states enable row level security;

-- Policies
DROP POLICY IF EXISTS "Allow public read access" on public.facility_states;
DROP POLICY IF EXISTS "Allow public insert access" on public.facility_states;
DROP POLICY IF EXISTS "Allow public update access" on public.facility_states;

create policy "Allow public read access" on public.facility_states for select using (true);
create policy "Allow public insert access" on public.facility_states for insert with check (true);
create policy "Allow public update access" on public.facility_states for update using (true);
