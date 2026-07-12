import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjanjwgrulfwtietrlwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYW5qd2dydWxmd3RpZXRybHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODY0MTksImV4cCI6MjA5NzU2MjQxOX0.2uYqzl7qDihG1jvZnxjUfY9zRkbfFIqHaNxS1ch2eRs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching equipment registry...');
  const { data: eq, error: eqErr } = await supabase
    .from('equipment_registry')
    .select('*');
  
  if (eqErr) {
    console.error('Error fetching equipment:', eqErr);
    return;
  }
  
  console.log(`Fetched ${eq.length} equipment entries.`);
  const pacEquip = eq.filter(e => e.category === 'COOLING' || e.category === 'AIRCON');
  console.log(`COOLING/AIRCON Equipment IDs:`, pacEquip.map(e => e.equipment_id));

  console.log('\nFetching equipment parameters...');
  const { data: params, error: paramErr } = await supabase
    .from('equipment_parameters')
    .select('*');
    
  if (paramErr) {
    console.error('Error fetching parameters:', paramErr);
    return;
  }
  
  console.log(`Fetched ${params.length} parameters.`);
  
  // Filter parameters for one of the COOLING units to see their names and units
  const pacIds = pacEquip.map(e => e.equipment_id);
  const pacParams = params.filter(p => pacIds.includes(p.equipment_id));
  
  console.log(`\nParameters for COOLING/AIRCON equipment:`);
  pacParams.forEach(p => {
    console.log(`  Equipment: ${p.equipment_id} | Name: "${p.parameter_name}" | Unit: "${p.unit}" | DataType: "${p.data_type}" | Constant: ${p.is_constant} | Value: ${p.constant_value}`);
  });
}

run();
