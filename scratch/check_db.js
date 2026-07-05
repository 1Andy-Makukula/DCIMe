import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";

// Load environment variables
const envContent = fs.readFileSync(".env", "utf8");
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

const supabaseUrl = urlMatch ? urlMatch[1].trim() : "";
const supabaseAnonKey = keyMatch ? keyMatch[1].trim() : "";

console.log("Supabase URL:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("\n--- EMPLOYEES ---");
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("*");
  if (empError) {
    console.error("Error fetching employees:", empError);
  } else {
    console.table(employees.map(e => ({
      id: e.id,
      full_name: e.full_name,
      email: e.email,
      employee_id: e.employee_id,
      role: e.role
    })));
  }

  console.log("\n--- TELEMETRY LOGS ---");
  const { data: logs, error: logsError } = await supabase
    .from("telemetry_logs")
    .select("id, target_hour, technician_name, submitted_at");
  if (logsError) {
    console.error("Error fetching telemetry logs:", logsError);
  } else {
    console.table(logs);
  }

  console.log("\n--- SHIFT REPORTS ---");
  const { data: reports, error: reportsError } = await supabase
    .from("shift_reports")
    .select("log_id, timestamp, technician_name, technician_id, certified");
  if (reportsError) {
    console.error("Error fetching shift reports:", reportsError);
  } else {
    console.table(reports);
  }
}

run();
