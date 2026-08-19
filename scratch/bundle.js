const fs = require('fs');
const path = require('path');

const root = 'c:\\Users\\Owner\\Downloads\\DCIMe_Engine';

const migrationFiles = [
  '20260811_widen_category_constraint.sql',
  '20260812_reference_layer.sql',
  '20260813_topology_graph.sql',
  '20260814_topology_layout.sql',
  '20260816_parameter_registry.sql',
  '20260816_room_geometry.sql',
  '20260816_unify_equipment_identity.sql',
  '20260817_capacity_analysis.sql',
  '20260818_ingestion_health.sql',
  '20260819_commissioning_import.sql',
  '20260820a_work_items.sql',
  '20260820b_threshold_alarms.sql',
  '20260821_sla_rollup.sql',
  '20260822_contractor_findings.sql',
  '20260823_preventive_schedules.sql',
  '20260824_scheduled_jobs.sql',
  '20260825_neutral_identifiers.sql',
  '20260827_signatures.sql'
];

const seedFiles = [
  '20260826_seed_site01_topology.sql',
  '20260816_seed_blueprint_parameters.sql',
  '20260815_seed_demo_it_load.sql',
  '20260817_seed_cooling_loads.sql'
];

let migrationsCombined = '';
for (const f of migrationFiles) {
  const p = path.join(root, 'supabase', 'migrations', f);
  if (fs.existsSync(p)) {
    migrationsCombined += `-- ==========================================\n-- MIGRATION: ${f}\n-- ==========================================\n` + fs.readFileSync(p, 'utf8') + '\n\n';
  }
}
fs.writeFileSync(path.join(root, 'supabase', 'combined_v2_migrations.sql'), migrationsCombined);

let seedsCombined = '';
for (const f of seedFiles) {
  const p = path.join(root, 'supabase', 'seed', f);
  if (fs.existsSync(p)) {
    seedsCombined += `-- ==========================================\n-- SEED: ${f}\n-- ==========================================\n` + fs.readFileSync(p, 'utf8') + '\n\n';
  }
}
fs.writeFileSync(path.join(root, 'supabase', 'combined_v2_seeds.sql'), seedsCombined);

console.log('Successfully bundled migrations and seeds!');
