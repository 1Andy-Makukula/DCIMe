-- ─────────────────────────────────────────────────────────────────────────────
-- DCIMe Engine — Database Schema
-- Reconstructed with 100% accuracy from live Supabase database types.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation extension if not already present
create extension if not exists "uuid-ossp";

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Employees Table
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.employees (
    id uuid default gen_random_uuid() primary key,
    auth_id uuid unique,
    full_name text not null,
    role text not null,
    created_at timestamptz default now()
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Equipment Registry Table (Inventory of active facility assets)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.equipment_registry (
    equipment_id text primary key,
    category text not null,
    location text not null,
    is_active boolean default true
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Shift Reports Table (Technician shift parent logging record)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.shift_reports (
    log_id uuid default gen_random_uuid() primary key,
    timestamp timestamptz default now(),
    logged_by uuid references public.employees(id) on delete set null,
    active_power_source text default 'Mains Active',
    site_id text default 'NTC ZM 0874',
    
    -- Added Handover Details
    notes text,
    certified boolean default false,
    technician_name text default 'Anderson M.',
    technician_id text default 'EMP-0874-AM',
    signature_id text,
    shift_duration text default '06:00 - 14:00',
    routine_logs_completed integer default 0,
    incidents_filed integer default 0
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Telemetry Environment Table (Room ambient temperature and humidity logs)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.telemetry_environment (
    id uuid default gen_random_uuid() primary key,
    log_id uuid references public.shift_reports(log_id) on delete cascade,
    room_name text not null,
    temperature_c numeric,
    humidity_pct numeric
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Telemetry Logs Table (Main hourly Relational Asset Dictionary logging)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.telemetry_logs (
    id uuid default gen_random_uuid() primary key,
    target_hour timestamptz not null unique,
    asset_id text default 'facility_wide', -- Nullable for unified hourly logging
    frequency text default 'hourly',       -- Nullable for unified hourly logging
    technician_name text default 'Anderson M.', -- Nullable for unified hourly logging
    metrics jsonb not null default '{}'::jsonb,
    is_edited boolean default false,
    submitted_at timestamptz default now(),
    last_edited_at timestamptz
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Telemetry Mains Table (Grid electricity supply and total site load logs)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.telemetry_mains (
    id uuid default gen_random_uuid() primary key,
    log_id uuid references public.shift_reports(log_id) on delete cascade,
    load_voltage numeric,
    load_amps numeric,
    power_factor numeric,
    total_kw numeric
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Telemetry Rectifiers Table (Rectifier load and status logs)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.telemetry_rectifiers (
    id uuid default gen_random_uuid() primary key,
    log_id uuid references public.shift_reports(log_id) on delete cascade,
    equipment_id text references public.equipment_registry(equipment_id) on delete set null,
    voltage numeric,
    amperage numeric,
    load_pct numeric
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Telemetry UPS Table (UPS load, battery voltage, and charge capacity logs)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.telemetry_ups (
    id uuid default gen_random_uuid() primary key,
    log_id uuid references public.shift_reports(log_id) on delete cascade,
    equipment_id text references public.equipment_registry(equipment_id) on delete set null,
    l1_volts numeric,
    l1_amps numeric,
    l2_volts numeric,
    l2_amps numeric,
    l3_volts numeric,
    l3_amps numeric,
    total_load_kw numeric,
    used_capacity_pct numeric,
    battery_vdc numeric,
    charge_pct numeric
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS) Enablement
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.employees enable row level security;
alter table public.equipment_registry enable row level security;
alter table public.shift_reports enable row level security;
alter table public.telemetry_environment enable row level security;
alter table public.telemetry_logs enable row level security;
alter table public.telemetry_mains enable row level security;
alter table public.telemetry_rectifiers enable row level security;
alter table public.telemetry_ups enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Frictionless Development RLS Policies (For telemetry_logs)
-- ─────────────────────────────────────────────────────────────────────────────

create policy "Allow public read access" on public.telemetry_logs for select using (true);
create policy "Allow public insert access" on public.telemetry_logs for insert with check (true);
create policy "Allow public update access" on public.telemetry_logs for update using (true);

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Incidents Table (Facility alert lifecycles and audits)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.incidents (
    id uuid default gen_random_uuid() primary key,
    ticket_number text not null unique,
    status text not null default 'OPEN', -- 'OPEN' or 'RESOLVED'
    site_name text not null default 'NTC ZM 0874',
    asset_id text not null,
    severity text not null, -- 'LOW', 'MEDIUM', 'HIGH'
    notes text,
    photo_url text,
    comments jsonb not null default '[]'::jsonb,
    created_at timestamptz default now(),

    raised_by_name text not null default 'Anderson M.',
    raised_by_id text not null default 'EMP-0874-AM',
    occurred_at timestamptz not null default now(),
    
    -- Resolution details
    resolved_at timestamptz,
    resolved_by_name text,
    resolved_by_id text,
    receipt_number text unique,
    impact text,
    contractor_engaged text,
    resolution_details text
);

-- Row Level Security (RLS) Enablement
alter table public.incidents enable row level security;

-- Frictionless Development RLS Policies
create policy "Allow public read access" on public.incidents for select using (true);
create policy "Allow public insert access" on public.incidents for insert with check (true);
create policy "Allow public update access" on public.incidents for update using (true);

-- Frictionless Development RLS Policies for shift_reports
create policy "Allow public read access" on public.shift_reports for select using (true);
create policy "Allow public insert access" on public.shift_reports for insert with check (true);
create policy "Allow public update access" on public.shift_reports for update using (true);

