export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      employees: {
        Row: {
          auth_id: string | null
          created_at: string | null
          full_name: string
          id: string
          email: string
          employee_id: string
          phone_number: string | null
          site_id: string
          role: "ADMIN" | "FIELD_TECH"
        }
        Insert: {
          auth_id?: string | null
          created_at?: string | null
          full_name: string
          id?: string
          email: string
          employee_id: string
          phone_number?: string | null
          site_id?: string
          role: "ADMIN" | "FIELD_TECH"
        }
        Update: {
          auth_id?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          email?: string
          employee_id?: string
          phone_number?: string | null
          site_id?: string
          role?: "ADMIN" | "FIELD_TECH"
        }
        Relationships: []
      }
      equipment_registry: {
        Row: {
          category: "UPS" | "GENERATOR" | "MAINS" | "RECTIFIER" | "AIRCON"
          equipment_id: string
          is_active: boolean | null
          location: string
        }
        Insert: {
          category: "UPS" | "GENERATOR" | "MAINS" | "RECTIFIER" | "AIRCON"
          equipment_id: string
          is_active?: boolean | null
          location: string
        }
        Update: {
          category?: "UPS" | "GENERATOR" | "MAINS" | "RECTIFIER" | "AIRCON"
          equipment_id?: string
          is_active?: boolean | null
          location?: string
        }
        Relationships: []
      }
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
        }
        Relationships: []
      }
      shift_reports: {
        Row: {
          active_power_source: "MAINS" | "GENERATOR" | "BLACKOUT" | null
          log_id: string
          logged_by: string | null
          site_id: string | null
          timestamp: string | null
        }
        Insert: {
          active_power_source?: "MAINS" | "GENERATOR" | "BLACKOUT" | null
          log_id?: string
          logged_by?: string | null
          site_id?: string | null
          timestamp?: string | null
        }
        Update: {
          active_power_source?: "MAINS" | "GENERATOR" | "BLACKOUT" | null
          log_id?: string
          logged_by?: string | null
          site_id?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_reports_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_environment: {
        Row: {
          humidity_pct: number | null
          id: string
          log_id: string | null
          room_name: string
          temperature_c: number | null
        }
        Insert: {
          humidity_pct?: number | null
          id?: string
          log_id?: string | null
          room_name: string
          temperature_c?: number | null
        }
        Update: {
          humidity_pct?: number | null
          id?: string
          log_id?: string | null
          room_name?: string
          temperature_c?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_environment_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "shift_reports"
            referencedColumns: ["log_id"]
          },
        ]
      }
      telemetry_logs: {
        Row: {
          asset_id: string
          frequency: string
          id: string
          is_edited: boolean | null
          last_edited_at: string | null
          metrics: Json
          submitted_at: string | null
          target_hour: string
          technician_name: string
        }
        Insert: {
          asset_id: string
          frequency: string
          id?: string
          is_edited?: boolean | null
          last_edited_at?: string | null
          metrics: Json
          submitted_at?: string | null
          target_hour: string
          technician_name: string
        }
        Update: {
          asset_id?: string
          frequency?: string
          id?: string
          is_edited?: boolean | null
          last_edited_at?: string | null
          metrics?: Json
          submitted_at?: string | null
          target_hour?: string
          technician_name?: string
        }
        Relationships: []
      }
      telemetry_mains: {
        Row: {
          id: string
          load_amps: number | null
          load_voltage: number | null
          log_id: string | null
          power_factor: number | null
          total_kw: number | null
        }
        Insert: {
          id?: string
          load_amps?: number | null
          load_voltage?: number | null
          log_id?: string | null
          power_factor?: number | null
          total_kw?: number | null
        }
        Update: {
          id?: string
          load_amps?: number | null
          load_voltage?: number | null
          log_id?: string | null
          power_factor?: number | null
          total_kw?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_mains_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "shift_reports"
            referencedColumns: ["log_id"]
          },
        ]
      }
      telemetry_rectifiers: {
        Row: {
          amperage: number | null
          equipment_id: string | null
          id: string
          load_pct: number | null
          log_id: string | null
          voltage: number | null
        }
        Insert: {
          amperage?: number | null
          equipment_id?: string | null
          id?: string
          load_pct?: number | null
          log_id?: string | null
          voltage?: number | null
        }
        Update: {
          amperage?: number | null
          equipment_id?: string | null
          id?: string
          load_pct?: number | null
          log_id?: string | null
          voltage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_rectifiers_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "telemetry_rectifiers_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "shift_reports"
            referencedColumns: ["log_id"]
          },
        ]
      }
      telemetry_ups: {
        Row: {
          battery_vdc: number | null
          charge_pct: number | null
          equipment_id: string | null
          id: string
          l1_amps: number | null
          l1_volts: number | null
          l2_amps: number | null
          l2_volts: number | null
          l3_amps: number | null
          l3_volts: number | null
          log_id: string | null
          total_load_kw: number | null
          used_capacity_pct: number | null
        }
        Insert: {
          battery_vdc?: number | null
          charge_pct?: number | null
          equipment_id?: string | null
          id?: string
          l1_amps?: number | null
          l1_volts?: number | null
          l2_amps?: number | null
          l2_volts?: number | null
          l3_amps?: number | null
          l3_volts?: number | null
          log_id?: string | null
          total_load_kw?: number | null
          used_capacity_pct?: number | null
        }
        Update: {
          battery_vdc?: number | null
          charge_pct?: number | null
          equipment_id?: string | null
          id?: string
          l1_amps?: number | null
          l1_volts?: number | null
          l2_amps?: number | null
          l2_volts?: number | null
          l3_amps?: number | null
          l3_volts?: number | null
          log_id?: string | null
          total_load_kw?: number | null
          used_capacity_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_ups_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "telemetry_ups_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "shift_reports"
            referencedColumns: ["log_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

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

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
