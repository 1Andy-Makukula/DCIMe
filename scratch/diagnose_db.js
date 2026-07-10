import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log("=== DIAGNOSING EMPLOYEES SITE RELATIONSHIPS ===");

  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('id, full_name, email, site_id, site_uuid')
    .limit(10);

  if (empError) {
    console.error("❌ SELECT employees Error:", empError.message);
  } else {
    console.log("✅ SELECT employees Success! Employees:");
    console.dir(employees);
  }
}

diagnose();
