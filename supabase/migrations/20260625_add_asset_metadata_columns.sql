-- ── Add missing metadata columns to equipment_registry ────────
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS manufacturer text;
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS firmware_version text;
ALTER TABLE public.equipment_registry ADD COLUMN IF NOT EXISTS rack_location text;

-- ── Seed specifications for existing UPS units ─────────────────
UPDATE public.equipment_registry
SET 
  name = COALESCE(name, 'UPS Unit ' || right(equipment_id, 3)),
  manufacturer = COALESCE(manufacturer, 'Vertiv'),
  model = COALESCE(model, 'Liebert EXL S1 80kVA'),
  firmware_version = COALESCE(firmware_version, 'v4.2.1'),
  rack_location = COALESCE(rack_location, 'R-' || right(equipment_id, 2)),
  ip_address = COALESCE(ip_address, '10.0.4.1' || right(equipment_id, 1))
WHERE category = 'UPS';

-- ── Seed specifications for existing generators ────────────────
UPDATE public.equipment_registry
SET 
  name = COALESCE(name, 'Diesel Generator ' || CASE WHEN right(equipment_id, 1) = '1' THEN 'A' ELSE 'B' END),
  manufacturer = COALESCE(manufacturer, 'Cummins'),
  model = COALESCE(model, 'C250 D5 250kVA'),
  firmware_version = COALESCE(firmware_version, 'v2.8.0'),
  ip_address = COALESCE(ip_address, '10.0.4.2' || right(equipment_id, 1))
WHERE category = 'GENERATOR';

-- ── Seed specifications for existing rectifiers ───────────────
UPDATE public.equipment_registry
SET 
  name = COALESCE(name, 'Rectifier ' || CASE WHEN right(equipment_id, 1) = '1' THEN 'A – Rm 1' ELSE 'B – Rm 2' END),
  manufacturer = COALESCE(manufacturer, 'Eltek'),
  model = COALESCE(model, 'Flatpack2 HE 48V'),
  firmware_version = COALESCE(firmware_version, 'v5.3.0'),
  rack_location = COALESCE(rack_location, 'R-0' || (4 + NULLIF(right(equipment_id, 1), '')::integer)),
  ip_address = COALESCE(ip_address, '10.0.4.3' || right(equipment_id, 1))
WHERE category = 'RECTIFIER';

-- ── Seed specifications for existing air conditioning units ────
UPDATE public.equipment_registry
SET 
  name = COALESCE(name, 'CRAC Unit ' || right(equipment_id, 3)),
  manufacturer = COALESCE(manufacturer, 'Stulz'),
  model = COALESCE(model, 'CyberAir 3PRO DX'),
  firmware_version = COALESCE(firmware_version, 'v3.1.4'),
  ip_address = COALESCE(ip_address, '10.0.5.1' || right(equipment_id, 1))
WHERE category = 'AIRCON';

-- ── Seed specifications for ZESCO mains ───────────────────────
UPDATE public.equipment_registry
SET 
  name = COALESCE(name, 'ZESCO Mains Grid'),
  manufacturer = COALESCE(manufacturer, 'ZESCO'),
  model = COALESCE(model, 'Utility Feed'),
  firmware_version = COALESCE(firmware_version, 'v1.0'),
  ip_address = COALESCE(ip_address, '10.0.4.50')
WHERE category = 'MAINS';
