import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkComplianceTable() {
  console.log("=== CHECKING COMPLIANCE_REPORTS TABLE ===");
  const { data, error } = await supabase
    .from('compliance_reports')
    .select('*')
    .limit(1);

  if (error) {
    console.error("❌ Table check failed:", error.message, error);
  } else {
    console.log("✅ Table exists! Rows fetched:", data.length);
  }
}

checkComplianceTable();
