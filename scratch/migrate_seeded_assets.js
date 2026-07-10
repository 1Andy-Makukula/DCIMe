import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("=== MIGRATING SEEDED ASSET METADATA ===");

  const { data: rows, error: fetchError } = await supabase
    .from('equipment_registry')
    .select('*');

  if (fetchError) {
    console.error("❌ Failed to fetch rows:", fetchError.message);
    return;
  }

  console.log(`Loaded ${rows.length} rows. Calculating and updating...`);

  for (const row of rows) {
    const id = row.equipment_id;
    const categoryDb = row.category;
    
    // Parse number from ID
    const parts = id.split("_");
    const lastPart = parts[parts.length - 1] || "001";
    // Check if last part is a number or contains a number
    const numMatch = lastPart.match(/\d+/);
    const num = numMatch ? numMatch[0].padStart(3, "0") : "001";
    
    let name = row.name || `Equipment ${id}`;
    let manufacturer = row.manufacturer || "Standard";
    let model = row.model || "Generic Model";
    let ip = row.ip_address || "10.0.4.10";
    let firmware = row.firmware_version || "v1.0.0";
    let rack = row.rack_location || "—";
    
    if (categoryDb === "UPS") {
      name = `UPS Unit ${num}`;
      manufacturer = "Vertiv";
      model = "Liebert EXL S1 80kVA";
      ip = `10.0.4.1${num.charAt(2) || '1'}`;
      firmware = "v4.2.1";
      rack = `R-${num.substring(1)}`;
    } else if (categoryDb === "GENERATOR") {
      name = id === "dg_hq" ? "Diesel Generator HQ" : `Diesel Generator ${num === "001" ? "A" : "B"}`;
      manufacturer = "Cummins";
      model = "C250 D5 250kVA";
      ip = `10.0.4.2${num.charAt(2) || '1'}`;
      firmware = "v2.8.0";
      rack = "—";
    } else if (categoryDb === "RECTIFIER") {
      name = `Rectifier ${num === "001" ? "A – Rm 1" : "B – Rm 2"}`;
      manufacturer = "Eltek";
      model = "Flatpack2 HE 48V";
      ip = `10.0.4.3${num.charAt(2) || '1'}`;
      firmware = "v5.3.0";
      rack = `R-0${4 + (parseInt(num) || 1)}`;
    } else if (categoryDb === "AIRCON") {
      name = `CRAC Unit ${num}`;
      manufacturer = "Stulz";
      model = "CyberAir 3PRO DX";
      ip = `10.0.5.1${num.charAt(2) || '1'}`;
      firmware = "v3.1.4";
      rack = "—";
    } else if (categoryDb === "MAINS") {
      name = "ZESCO Mains Grid";
      manufacturer = "ZESCO";
      model = "Utility Feed";
      ip = "10.0.4.50";
      firmware = "v1.0";
      rack = "—";
    }

    const { error: updateError } = await supabase
      .from('equipment_registry')
      .update({
        name: name,
        ip_address: ip,
        manufacturer: manufacturer,
        model: model,
        firmware_version: firmware,
        rack_location: rack
      })
      .eq('equipment_id', id);

    if (updateError) {
      console.error(`❌ Failed to update ${id}:`, updateError.message);
    } else {
      console.log(`✅ Updated ${id} -> Name: "${name}", IP: "${ip}", Mfg: "${manufacturer}", Model: "${model}"`);
    }
  }

  console.log("=== MIGRATION COMPLETE ===");
}

migrate();
