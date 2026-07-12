import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log("=== INSPECTING TELEMETRY LOGS ===");
  const { data: tel, error: telError } = await supabase
    .from('telemetry_logs')
    .select('*')
    .limit(1);

  if (telError) {
    console.error("Error tel:", telError);
  } else {
    console.log("Telemetry logs sample:", JSON.stringify(tel, null, 2));
  }

  console.log("=== INSPECTING INCIDENTS ===");
  const { data: inc, error: incError } = await supabase
    .from('incidents')
    .select('*')
    .limit(1);

  if (incError) {
    console.error("Error inc:", incError);
  } else {
    console.log("Incidents sample:", JSON.stringify(inc, null, 2));
  }
}

inspect().catch(err => {
  console.error("Fatal inspect error:", err);
  process.exit(1);
});
