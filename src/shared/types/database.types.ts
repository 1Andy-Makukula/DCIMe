// src/shared/types/database.types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hand-curated from the live DCIMe schema.sql + migrations.
// Regenerate with: npx supabase gen types typescript --project-id <id>
// ─────────────────────────────────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {

      // ── sites ──────────────────────────────────────────────────────────────
      sites: {
        Row: {
          id: string
          site_code: string
          site_name: string
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          site_code: string
          site_name: string
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          site_code?: string
          site_name?: string
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }

      // ── rooms ──────────────────────────────────────────────────────────────
      rooms: {
        Row: {
          id: string
          site_id: string
          room_name: string
          sort_order: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          site_id: string
          room_name: string
          sort_order?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          site_id?: string
          room_name?: string
          sort_order?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          }
        ]
      }

      // ── employees ──────────────────────────────────────────────────────────
      employees: {
        Row: {
          id: string
          auth_id: string | null
          full_name: string
          email: string
          employee_id: string
          phone_number: string | null
          site_id: string
          role: "ADMIN" | "FIELD_TECH"
          created_at: string | null
          site_uuid: string | null
        }
        Insert: {
          id?: string
          auth_id?: string | null
          full_name: string
          email: string
          employee_id: string
          phone_number?: string | null
          site_id: string
          role: "ADMIN" | "FIELD_TECH"
          created_at?: string | null
          site_uuid?: string | null
        }
        Update: {
          id?: string
          auth_id?: string | null
          full_name?: string
          email?: string
          employee_id?: string
          phone_number?: string | null
          site_id?: string
          role?: "ADMIN" | "FIELD_TECH"
          created_at?: string | null
          site_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_auth_id_fkey"
            columns: ["auth_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          }
        ]
      }

      // ── equipment_registry ─────────────────────────────────────────────────
      equipment_registry: {
        Row: {
          equipment_id: string
          category: "UPS" | "GENERATOR" | "MAINS" | "RECTIFIER" | "AIRCON" | "ENVIRONMENT" | "FIRE_SUPPRESSION" | "FUEL_LOGISTICS" | "LOAD_PANEL"
          location: string
          is_active: boolean | null
          room_id: string | null
          sort_order: number | null
          site_uuid: string | null
          name: string | null
          ip_address: string | null
          manufacturer: string | null
          model: string | null
          firmware_version: string | null
          rack_location: string | null
        }
        Insert: {
          equipment_id: string
          category: "UPS" | "GENERATOR" | "MAINS" | "RECTIFIER" | "AIRCON" | "ENVIRONMENT" | "FIRE_SUPPRESSION" | "FUEL_LOGISTICS" | "LOAD_PANEL"
          location: string
          is_active?: boolean | null
          room_id?: string | null
          sort_order?: number | null
          site_uuid?: string | null
          name?: string | null
          ip_address?: string | null
          manufacturer?: string | null
          model?: string | null
          firmware_version?: string | null
          rack_location?: string | null
        }
        Update: {
          equipment_id?: string
          category?: "UPS" | "GENERATOR" | "MAINS" | "RECTIFIER" | "AIRCON" | "ENVIRONMENT" | "FIRE_SUPPRESSION" | "FUEL_LOGISTICS" | "LOAD_PANEL"
          location?: string
          is_active?: boolean | null
          room_id?: string | null
          sort_order?: number | null
          site_uuid?: string | null
          name?: string | null
          ip_address?: string | null
          manufacturer?: string | null
          model?: string | null
          firmware_version?: string | null
          rack_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          }
        ]
      }

      // ── equipment_parameters ───────────────────────────────────────────────
      equipment_parameters: {
        Row: {
          id: string
          equipment_id: string
          parameter_name: string
          data_type: "number" | "string" | "boolean"
          is_constant: boolean | null
          constant_value: string | null
          is_graphable: boolean | null
          unit: string | null
          created_at: string | null
          excel_workbook: string | null
          excel_sheet_name: string | null
          excel_column_index: number | null
        }
        Insert: {
          id?: string
          equipment_id: string
          parameter_name: string
          data_type?: "number" | "string" | "boolean"
          is_constant?: boolean | null
          constant_value?: string | null
          is_graphable?: boolean | null
          unit?: string | null
          created_at?: string | null
          excel_workbook?: string | null
          excel_sheet_name?: string | null
          excel_column_index?: number | null
        }
        Update: {
          id?: string
          equipment_id?: string
          parameter_name?: string
          data_type?: "number" | "string" | "boolean"
          is_constant?: boolean | null
          constant_value?: string | null
          is_graphable?: boolean | null
          unit?: string | null
          created_at?: string | null
          excel_workbook?: string | null
          excel_sheet_name?: string | null
          excel_column_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ep_equipment"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          }
        ]
      }

      // ── equipment_connections ──────────────────────────────────────────────
      equipment_connections: {
        Row: {
          id: string
          source_equipment_id: string
          target_equipment_id: string
          connection_type: "POWER" | "DATA" | "COOLING" | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          source_equipment_id: string
          target_equipment_id: string
          connection_type?: "POWER" | "DATA" | "COOLING" | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          source_equipment_id?: string
          target_equipment_id?: string
          connection_type?: "POWER" | "DATA" | "COOLING" | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_source_equipment"
            columns: ["source_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_target_equipment"
            columns: ["target_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          }
        ]
      }

      // ── equipment_status_logs ──────────────────────────────────────────────
      equipment_status_logs: {
        Row: {
          log_id: string
          equipment_id: string | null
          status_state: "ONLINE" | "DEGRADED" | "OFFLINE"
          technician_comment: string | null
          changed_by: string | null
          created_at: string | null
        }
        Insert: {
          log_id?: string
          equipment_id?: string | null
          status_state: "ONLINE" | "DEGRADED" | "OFFLINE"
          technician_comment?: string | null
          changed_by?: string | null
          created_at?: string | null
        }
        Update: {
          log_id?: string
          equipment_id?: string | null
          status_state?: "ONLINE" | "DEGRADED" | "OFFLINE"
          technician_comment?: string | null
          changed_by?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_status_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "equipment_status_logs_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }

      // ── telemetry_logs ─────────────────────────────────────────────────────
      telemetry_logs: {
        Row: {
          id: string
          technician_name: string
          target_hour: string
          submitted_at: string | null
          frequency: string
          asset_id: string
          metrics: Json
          is_edited: boolean | null
          last_edited_at: string | null
          technician_id: string | null
          site_uuid: string | null
        }
        Insert: {
          id?: string
          technician_name: string
          target_hour: string
          submitted_at?: string | null
          frequency: string
          asset_id: string
          metrics: Json
          is_edited?: boolean | null
          last_edited_at?: string | null
          technician_id?: string | null
          site_uuid?: string | null
        }
        Update: {
          id?: string
          technician_name?: string
          target_hour?: string
          submitted_at?: string | null
          frequency?: string
          asset_id?: string
          metrics?: Json
          is_edited?: boolean | null
          last_edited_at?: string | null
          technician_id?: string | null
          site_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetry_employee"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetry_site"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          }
        ]
      }

      // ── incidents ──────────────────────────────────────────────────────────
      incidents: {
        Row: {
          id: string
          ticket_number: string
          status: "OPEN" | "RESOLVED"
          site_name: string
          asset_id: string
          severity: "low" | "medium" | "critical"
          notes: string | null
          photo_url: string | null
          comments: Json
          created_at: string | null
          raised_by_name: string
          raised_by_id: string
          occurred_at: string
          resolved_at: string | null
          resolved_by_name: string | null
          resolved_by_id: string | null
          receipt_number: string | null
          impact: string | null
          contractor_engaged: string | null
          resolution_details: string | null
          site_uuid: string | null
        }
        Insert: {
          id?: string
          ticket_number: string
          status?: "OPEN" | "RESOLVED"
          site_name?: string
          asset_id: string
          severity: "low" | "medium" | "critical"
          notes?: string | null
          photo_url?: string | null
          comments?: Json
          created_at?: string | null
          raised_by_name?: string
          raised_by_id?: string
          occurred_at?: string
          resolved_at?: string | null
          resolved_by_name?: string | null
          resolved_by_id?: string | null
          receipt_number?: string | null
          impact?: string | null
          contractor_engaged?: string | null
          resolution_details?: string | null
          site_uuid?: string | null
        }
        Update: {
          id?: string
          ticket_number?: string
          status?: "OPEN" | "RESOLVED"
          site_name?: string
          asset_id?: string
          severity?: "low" | "medium" | "critical"
          notes?: string | null
          photo_url?: string | null
          comments?: Json
          created_at?: string | null
          raised_by_name?: string
          raised_by_id?: string
          occurred_at?: string
          resolved_at?: string | null
          resolved_by_name?: string | null
          resolved_by_id?: string | null
          receipt_number?: string | null
          impact?: string | null
          contractor_engaged?: string | null
          resolution_details?: string | null
          site_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          }
        ]
      }

      // ── shift_reports ──────────────────────────────────────────────────────
      shift_reports: {
        Row: {
          log_id: string
          site_id: string | null
          logged_by: string | null
          timestamp: string | null
          active_power_source: "MAINS" | "GENERATOR" | "BLACKOUT" | null
          notes: string | null
          certified: boolean | null
          technician_name: string | null
          technician_id: string | null
          signature_id: string | null
          shift_duration: string | null
          routine_logs_completed: number | null
          incidents_filed: number | null
          site_uuid: string | null
        }
        Insert: {
          log_id?: string
          site_id?: string | null
          logged_by?: string | null
          timestamp?: string | null
          active_power_source?: "MAINS" | "GENERATOR" | "BLACKOUT" | null
          notes?: string | null
          certified?: boolean | null
          technician_name?: string | null
          technician_id?: string | null
          signature_id?: string | null
          shift_duration?: string | null
          routine_logs_completed?: number | null
          incidents_filed?: number | null
          site_uuid?: string | null
        }
        Update: {
          log_id?: string
          site_id?: string | null
          logged_by?: string | null
          timestamp?: string | null
          active_power_source?: "MAINS" | "GENERATOR" | "BLACKOUT" | null
          notes?: string | null
          certified?: boolean | null
          technician_name?: string | null
          technician_id?: string | null
          signature_id?: string | null
          shift_duration?: string | null
          routine_logs_completed?: number | null
          incidents_filed?: number | null
          site_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_reports_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          }
        ]
      }

      // ── compliance_reports ─────────────────────────────────────────────────
      compliance_reports: {
        Row: {
          id: string
          form_type: "AIRTEL_DAILY_CHECKLIST" | "DG_LOGBOOK"
          form_data: Json
          technician_id: string | null
          site_uuid: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          form_type: "AIRTEL_DAILY_CHECKLIST" | "DG_LOGBOOK"
          form_data: Json
          technician_id?: string | null
          site_uuid?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          form_type?: "AIRTEL_DAILY_CHECKLIST" | "DG_LOGBOOK"
          form_data?: Json
          technician_id?: string | null
          site_uuid?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_compliance_employee"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compliance_site"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          }
        ]
      }

      // ── facility_states ────────────────────────────────────────────────────
      facility_states: {
        Row: {
          site_uuid: string
          fsm_mode: "NORMAL" | "DAILY_TEST" | "OUTAGE" | "ON_LOAD_TEST"
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          site_uuid: string
          fsm_mode?: "NORMAL" | "DAILY_TEST" | "OUTAGE" | "ON_LOAD_TEST"
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          site_uuid?: string
          fsm_mode?: "NORMAL" | "DAILY_TEST" | "OUTAGE" | "ON_LOAD_TEST"
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facility_states_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_states_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          }
        ]
      }

    }

    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_site_uuid: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      equipment_category: "UPS" | "GENERATOR" | "MAINS" | "RECTIFIER" | "AIRCON" | "ENVIRONMENT" | "FIRE_SUPPRESSION" | "FUEL_LOGISTICS" | "LOAD_PANEL"
      fsm_mode_type: "NORMAL" | "DAILY_TEST" | "OUTAGE" | "ON_LOAD_TEST"
      parameter_data_type: "number" | "string" | "boolean"
      equipment_status_state: "ONLINE" | "DEGRADED" | "OFFLINE"
      connection_type: "POWER" | "DATA" | "COOLING"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility type helpers (generated boilerplate — do not edit)
// ─────────────────────────────────────────────────────────────────────────────

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

// ─────────────────────────────────────────────────────────────────────────────
// Convenience re-exports for frequently-used row types
// ─────────────────────────────────────────────────────────────────────────────
export type SiteRow               = Tables<"sites">
export type RoomRow               = Tables<"rooms">
export type EmployeeRow           = Tables<"employees">
export type EquipmentRow          = Tables<"equipment_registry">
export type EquipmentParamRow     = Tables<"equipment_parameters">
export type EquipmentConnRow      = Tables<"equipment_connections">
export type EquipmentStatusRow    = Tables<"equipment_status_logs">
export type TelemetryLogRow       = Tables<"telemetry_logs">
export type IncidentRow           = Tables<"incidents">
export type ShiftReportRow        = Tables<"shift_reports">
export type ComplianceReportRow   = Tables<"compliance_reports">
export type FacilityStateRow      = Tables<"facility_states">

export const Constants = {
  public: {
    Enums: {
      equipment_category: ["UPS", "GENERATOR", "MAINS", "RECTIFIER", "AIRCON", "ENVIRONMENT", "FIRE_SUPPRESSION", "FUEL_LOGISTICS", "LOAD_PANEL"] as const,
      fsm_mode_type: ["NORMAL", "DAILY_TEST", "OUTAGE", "ON_LOAD_TEST"] as const,
      parameter_data_type: ["number", "string", "boolean"] as const,
      equipment_status_state: ["ONLINE", "DEGRADED", "OFFLINE"] as const,
      connection_type: ["POWER", "DATA", "COOLING"] as const,
    },
  },
} as const
