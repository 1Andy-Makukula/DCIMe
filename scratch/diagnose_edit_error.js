import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log("=== DIAGNOSING EDIT ERROR ===");

  // Simulate updating a standard UPS asset
  console.log("\nSimulating update on ups_1...");
  const { error: upsError } = await supabase
    .from('equipment_registry')
    .update({
      name: 'UPS Unit 001 - Edited',
      category: 'UPS',
      ip_address: '10.0.4.11',
      room_id: '051f271f-348f-4d77-a594-82750385d5e8',
      location: 'Power Room 1',
      manufacturer: 'Vertiv',
      model: 'Liebert EXL S1 80kVA',
      firmware_version: 'v4.2.1',
      rack_location: 'R-01'
    })
    .eq('equipment_id', 'ups_1');

  if (upsError) {
    console.error("❌ ups_1 Update Failed:", upsError.message, upsError);
  } else {
    console.log("✅ ups_1 Update Succeeded!");
  }

  // Simulate updating an environment sensor
  console.log("\nSimulating update on room_server_ambient...");
  const { error: envError } = await supabase
    .from('equipment_registry')
    .update({
      name: 'Server Room Temp - Edited',
      category: 'ENVIRONMENT',
      ip_address: '10.0.4.10',
      room_id: '2b277f42-dd86-4084-ae45-7a6c2348bfe5',
      location: 'The Server Room',
      manufacturer: 'Standard',
      model: 'Generic Model',
      firmware_version: 'v1.0.0',
      rack_location: '—'
    })
    .eq('equipment_id', 'room_server_ambient');

  if (envError) {
    console.error("❌ room_server_ambient Update Failed:", envError.message, envError);
  } else {
    console.log("✅ room_server_ambient Update Succeeded!");
  }
}

diagnose();
