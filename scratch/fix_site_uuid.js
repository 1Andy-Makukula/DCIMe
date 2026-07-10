import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSiteUuid() {
  console.log("=== FIXING EMPLOYEES SITE UUID ===");

  const { data, error } = await supabase
    .from('employees')
    .update({ site_uuid: '9f178c7c-52b4-45f2-92f9-426417c76199' })
    .is('site_uuid', null)
    .select();

  if (error) {
    console.error("❌ Failed to update employees:", error.message, error);
  } else {
    console.log("✅ Successfully updated employees! Updated Rows:", data);
  }
}

fixSiteUuid();
