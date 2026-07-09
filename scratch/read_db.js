import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Querying Supabase telemetry logs...');
  const { data, error } = await supabase
    .from('telemetry_logs')
    .select('*')
    .limit(100);
  
  if (error) {
    console.error('Error fetching logs:', error);
    return;
  }
  
  console.log(`Fetched ${data.length} logs.`);
  let found = 0;
  for (const log of data) {
    if (log.metrics) {
      const keys = Object.keys(log.metrics);
      const pacKeys = keys.filter(k => k.includes('return_temp_set') || k.includes('humidity_set'));
      if (pacKeys.length > 0) {
        found++;
        console.log(`\nLog target_hour: ${log.target_hour}`);
        pacKeys.forEach(k => {
          console.log(`  ${k}: ${log.metrics[k]}`);
        });
      }
    }
  }
  if (found === 0) {
    console.log('No PAC setpoints found in database logs.');
  }
}

run();
