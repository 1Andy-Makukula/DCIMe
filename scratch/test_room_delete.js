import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDelete() {
  console.log("=== CREATING TEMP TEST ROOM ===");
  
  // 1. Get site_id
  const { data: sites } = await supabase.from('sites').select('id').limit(1);
  if (!sites || sites.length === 0) {
    console.error("No sites found.");
    return;
  }
  const siteId = sites[0].id;

  // 2. Insert temp room
  const { data: room, error: insertErr } = await supabase
    .from('rooms')
    .insert([{ room_name: 'TEMP_TEST_ROOM_DELETE', site_id: siteId, sort_order: 999 }])
    .select()
    .single();

  if (insertErr) {
    console.error("❌ Insert failed:", insertErr.message);
    return;
  }
  console.log("✅ Temp room created:", room.id);

  // 3. Delete temp room
  console.log("=== DELETING TEMP TEST ROOM ===");
  const { data: deleteData, error: deleteErr } = await supabase
    .from('rooms')
    .delete()
    .eq('id', room.id);

  if (deleteErr) {
    console.error("❌ Delete failed:", deleteErr.message);
  } else {
    console.log("✅ Delete succeeded!");
  }
}

testDelete();
