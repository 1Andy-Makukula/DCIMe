-- ============================================================
-- DCIMe Admin NOC Dashboard Wiring Migration
-- Run this in Supabase Dashboard → SQL Editor
-- Safe: uses ADD COLUMN IF NOT EXISTS — won't touch existing columns
-- ============================================================

-- ── 1. Extend equipment_registry (add asset metadata) ────────
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS manufacturer text;
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS firmware_version text;
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS rack_location text;

-- ── 2. Extend incidents (add acknowledgement tracking) ────────
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS acknowledged boolean DEFAULT false;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS acknowledged_by text;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- ── 3. Extend employees (add personnel details & status) ──────
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS clearance_zone text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS shift_schedule text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS access_level integer DEFAULT 1;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS badge_id text;

-- Safe unique constraint addition for badge_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'employees_badge_id_key'
    ) THEN
        ALTER TABLE public.employees ADD CONSTRAINT employees_badge_id_key UNIQUE (badge_id);
    END IF;
END $$;

-- ── 4. Enable RLS and Configure Policies ─────────────────────
ALTER TABLE public.equipment_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid duplicates
DROP POLICY IF EXISTS "Allow public read access" ON public.equipment_registry;
DROP POLICY IF EXISTS "Allow public insert access" ON public.equipment_registry;
DROP POLICY IF EXISTS "Allow public update access" ON public.equipment_registry;

DROP POLICY IF EXISTS "Allow public read access" ON public.employees;
DROP POLICY IF EXISTS "Allow public insert access" ON public.employees;
DROP POLICY IF EXISTS "Allow public update access" ON public.employees;

-- Create secure policies for authenticated users
CREATE POLICY "Allow public read access" ON public.equipment_registry FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.equipment_registry FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow public update access" ON public.equipment_registry FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow public read access" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.employees FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow public update access" ON public.employees FOR UPDATE USING (auth.role() = 'authenticated');

-- ── 5. Seed Initial Assets ────────────────────────────────────
INSERT INTO public.equipment_registry (equipment_id, category, location, is_active, name, manufacturer, model, ip_address, firmware_version, rack_location)
VALUES 
  ('PWR-UPS-001', 'Power', 'Main Room', true, 'UPS Unit 1', 'Vertiv', 'Liebert EXL S1 80kVA', '10.0.4.11', 'v4.2.1', 'R-01'),
  ('PWR-UPS-002', 'Power', 'Main Room', true, 'UPS Unit 2', 'Vertiv', 'Liebert EXL S1 80kVA', '10.0.4.12', 'v4.2.1', 'R-02'),
  ('PWR-GEN-001', 'Power', 'Generator Room', true, 'Diesel Generator A', 'Cummins', 'C250 D5 250kVA', '10.0.4.21', 'v2.8.0', '—'),
  ('PWR-GEN-002', 'Power', 'Generator Room', true, 'Diesel Generator B', 'Cummins', 'C250 D5 250kVA', '10.0.4.22', 'v2.8.0', '—'),
  ('PWR-PDU-001', 'Power', 'Main Room', true, 'PDU Rack A', 'APC', 'AP8941 Metered Rack PDU', '10.0.4.15', 'v6.9.6', 'R-01'),
  ('PWR-PDU-002', 'Power', 'Power Room 1', true, 'PDU Rack B', 'APC', 'AP8941 Metered Rack PDU', '10.0.4.16', 'v6.9.6', 'R-04'),
  ('COOL-CRAC-001', 'Cooling', 'Main Room', true, 'CRAC Unit 1', 'Stulz', 'CyberAir 3PRO DX', '10.0.5.11', 'v3.1.4', '—'),
  ('COOL-CRAC-002', 'Cooling', 'Power Room 1', true, 'CRAC Unit 2', 'Stulz', 'CyberAir 3PRO DX', '10.0.5.12', 'v3.1.4', '—'),
  ('COOL-CRAC-003', 'Cooling', 'Power Room 2', true, 'CRAC Unit 3', 'Stulz', 'CyberAir 3PRO DX', '10.0.5.13', 'v3.0.9', '—'),
  ('COOL-CRAC-004', 'Cooling', 'Entrance Room 1', true, 'CRAC Unit 4', 'Stulz', 'CyberAir 3PRO DX', '10.0.5.14', 'v3.1.4', '—'),
  ('NET-SW-001', 'Network', 'Main Room', true, 'Core Switch 1', 'Cisco', 'Nexus 93180YC-EX', '10.0.1.1', 'NX-OS 10.2(5)', 'R-01'),
  ('NET-SW-002', 'Network', 'Main Room', true, 'Core Switch 2', 'Cisco', 'Nexus 93180YC-EX', '10.0.1.2', 'NX-OS 10.2(5)', 'R-02'),
  ('PWR-RECT-001', 'Power', 'Power Room 1', true, 'Rectifier A – Rm 1', 'Eltek', 'Flatpack2 HE 48V', '10.0.4.31', 'v5.3.0', 'R-05'),
  ('PWR-RECT-002', 'Power', 'Power Room 2', true, 'Rectifier B – Rm 2', 'Eltek', 'Flatpack2 HE 48V', '10.0.4.32', 'v5.3.0', 'R-06'),
  ('COMP-SRV-001', 'Compute', 'Main Room', true, 'Management Server', 'Dell', 'PowerEdge R750xs', '10.0.2.10', 'iDRAC 7.00.00', 'R-03'),
  ('NET-FW-001', 'Network', 'Main Room', false, 'Perimeter Firewall', 'Fortinet', 'FortiGate 600F', '10.0.1.254', 'FortiOS 7.4.3', 'R-01')
ON CONFLICT (equipment_id) DO NOTHING;

-- ── 6. Seed Initial Roster ────────────────────────────────────
INSERT INTO public.employees (badge_id, full_name, role, email, phone, clearance_zone, shift_schedule, access_level, status)
VALUES
  ('ZM-4891', 'Ndabane Anderson M.', 'ADMIN', 'anderson.m@airtel.zm', '+260 97 123 4567', 'Global (All Rooms)', '06:00 – 14:00', 5, 'Active'),
  ('ZM-5204', 'Chileshe Kapumpe K.', 'FIELD_TECH', 'chileshe.k@airtel.zm', '+260 96 234 5678', 'Power Room 1 & 2', '14:00 – 22:00', 3, 'Active'),
  ('ZM-5491', 'Mwansa Bwalya B.', 'FIELD_TECH', 'mwansa.b@airtel.zm', '+260 95 345 6789', 'Main Room', '22:00 – 06:00', 3, 'Active'),
  ('ZM-3874', 'Tembo Sikazwe R.', 'ADMIN', 'tembo.r@airtel.zm', '+260 97 456 7890', 'Global (All Rooms)', '14:00 – 22:00', 5, 'Active'),
  ('ZM-6102', 'Phiri Grace N.', 'FIELD_TECH', 'grace.n@airtel.zm', '+260 96 567 8901', 'Entrance Room 1', '06:00 – 14:00', 1, 'Active'),
  ('ZM-5889', 'Lungu Mpande D.', 'FIELD_TECH', 'lungu.d@airtel.zm', '+260 95 678 9012', 'Power Room 2', '22:00 – 06:00', 1, 'Revoked'),
  ('ZM-4477', 'Kabwe Mutale F.', 'FIELD_TECH', 'kabwe.f@airtel.zm', '+260 97 789 0123', 'Global (All Rooms)', '06:00 – 18:00', 4, 'Active'),
  ('ZM-5714', 'Sakala Josephine M.', 'FIELD_TECH', 'josephine.s@airtel.zm', '+260 96 890 1234', 'Main Room', '06:00 – 14:00', 3, 'Active')
ON CONFLICT (badge_id) DO NOTHING;
