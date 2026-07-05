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
          email: string
          employee_id: string
          full_name: string
          id: string
          phone_number: string | null
          role: string
          site_id: string
        }
        Insert: {
          auth_id?: string | null
          created_at?: string | null
          email: string
          employee_id: string
          full_name: string
          id?: string
          phone_number?: string | null
          role: string
          site_id: string
        }
        Update: {
          auth_id?: string | null
          created_at?: string | null
          email?: string
          employee_id?: string
          full_name?: string
          id?: string
          phone_number?: string | null
          role?: string
          site_id?: string
        }
        Relationships: []
      }
      equipment_registry: {
        Row: {
          category: string
          equipment_id: string
          is_active: boolean | null
          location: string
        }
        Insert: {
          category: string
          equipment_id: string
          is_active?: boolean | null
          location: string
        }
        Update: {
          category?: string
          equipment_id?: string
          is_active?: boolean | null
          location?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          asset_id: string
          comments: Json
          contractor_engaged: string | null
          created_at: string | null
          id: string
          impact: string | null
          notes: string | null
          occurred_at: string
          photo_url: string | null
          raised_by_id: string
          raised_by_name: string
          receipt_number: string | null
          resolution_details: string | null
          resolved_at: string | null
          resolved_by_id: string | null
          resolved_by_name: string | null
          severity: string
          site_name: string
          status: string
          ticket_number: string
        }
        Insert: {
          asset_id: string
          comments?: Json
          contractor_engaged?: string | null
          created_at?: string | null
          id?: string
          impact?: string | null
          notes?: string | null
          occurred_at?: string
          photo_url?: string | null
          raised_by_id?: string
          raised_by_name?: string
          receipt_number?: string | null
          resolution_details?: string | null
          resolved_at?: string | null
          resolved_by_id?: string | null
          resolved_by_name?: string | null
          severity: string
          site_name?: string
          status?: string
          ticket_number: string
        }
        Update: {
          asset_id?: string
          comments?: Json
          contractor_engaged?: string | null
          created_at?: string | null
          id?: string
          impact?: string | null
          notes?: string | null
          occurred_at?: string
          photo_url?: string | null
          raised_by_id?: string
          raised_by_name?: string
          receipt_number?: string | null
          resolution_details?: string | null
          resolved_at?: string | null
          resolved_by_id?: string | null
          resolved_by_name?: string | null
          severity?: string
          site_name?: string
          status?: string
          ticket_number?: string
        }
        Relationships: []
      }
      shift_reports: {
        Row: {
          active_power_source: string | null
          certified: boolean | null
          incidents_filed: number | null
          log_id: string
          logged_by: string | null
          notes: string | null
          routine_logs_completed: number | null
          shift_duration: string | null
          signature_id: string | null
          site_id: string | null
          technician_id: string | null
          technician_name: string | null
          timestamp: string | null
        }
        Insert: {
          active_power_source?: string | null
          certified?: boolean | null
          incidents_filed?: number | null
          log_id?: string
          logged_by?: string | null
          notes?: string | null
          routine_logs_completed?: number | null
          shift_duration?: string | null
          signature_id?: string | null
          site_id?: string | null
          technician_id?: string | null
          technician_name?: string | null
          timestamp?: string | null
        }
        Update: {
          active_power_source?: string | null
          certified?: boolean | null
          incidents_filed?: number | null
          log_id?: string
          logged_by?: string | null
          notes?: string | null
          routine_logs_completed?: number | null
          shift_duration?: string | null
          signature_id?: string | null
          site_id?: string | null
          technician_id?: string | null
          technician_name?: string | null
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
