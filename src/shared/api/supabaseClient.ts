import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

// Typed with Database generic — every .from('table') call is now fully
// type-checked against database.types.ts. If a table or column doesn't
// exist in the types, TypeScript will catch it at compile time.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
