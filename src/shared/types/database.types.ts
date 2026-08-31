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
      contractor_findings: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          equipment_id: string | null
          id: string
          severity: string
          site_uuid: string
          summary: string
          visit_id: string
          work_item_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          equipment_id?: string | null
          id?: string
          severity: string
          site_uuid: string
          summary: string
          visit_id: string
          work_item_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          equipment_id?: string | null
          id?: string
          severity?: string
          site_uuid?: string
          summary?: string
          visit_id?: string
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_findings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "contractor_findings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "contractor_findings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "contractor_findings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "contractor_findings_severity_fkey"
            columns: ["severity"]
            isOneToOne: false
            referencedRelation: "sla_targets"
            referencedColumns: ["severity"]
          },
          {
            foreignKeyName: "contractor_findings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "contractor_findings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_findings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "contractor_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_findings_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_findings_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_visits: {
        Row: {
          contractor: string
          contractor_signature: string | null
          contractor_signed_at: string | null
          contractor_signed_name: string | null
          created_at: string
          id: string
          logged_by_id: string
          logged_by_name: string
          notes: string
          occurred_at: string
          photo_url: string | null
          purpose: string
          site_uuid: string
          target_ref: string | null
          target_type: string
          vendor_id: string | null
          visit_number: string
        }
        Insert: {
          contractor: string
          contractor_signature?: string | null
          contractor_signed_at?: string | null
          contractor_signed_name?: string | null
          created_at?: string
          id?: string
          logged_by_id?: string
          logged_by_name?: string
          notes?: string
          occurred_at?: string
          photo_url?: string | null
          purpose: string
          site_uuid: string
          target_ref?: string | null
          target_type: string
          vendor_id?: string | null
          visit_number: string
        }
        Update: {
          contractor?: string
          contractor_signature?: string | null
          contractor_signed_at?: string | null
          contractor_signed_name?: string | null
          created_at?: string
          id?: string
          logged_by_id?: string
          logged_by_name?: string
          notes?: string
          occurred_at?: string
          photo_url?: string | null
          purpose?: string
          site_uuid?: string
          target_ref?: string | null
          target_type?: string
          vendor_id?: string | null
          visit_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_visits_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "contractor_visits_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_visits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_activity"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "contractor_visits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
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
          site_uuid: string
          status: string
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
          site_uuid: string
          status?: string
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
          site_uuid?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "employees_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_connections: {
        Row: {
          connection_type: string | null
          created_at: string | null
          created_by: string | null
          id: string
          input_priority: number
          is_active: boolean | null
          provenance: string
          render_path_d: string | null
          render_path_id: string | null
          source_equipment_id: string
          source_port: string
          target_equipment_id: string
          target_port: string
          updated_at: string
        }
        Insert: {
          connection_type?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          input_priority?: number
          is_active?: boolean | null
          provenance?: string
          render_path_d?: string | null
          render_path_id?: string | null
          source_equipment_id: string
          source_port?: string
          target_equipment_id: string
          target_port?: string
          updated_at?: string
        }
        Update: {
          connection_type?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          input_priority?: number
          is_active?: boolean | null
          provenance?: string
          render_path_d?: string | null
          render_path_id?: string | null
          source_equipment_id?: string
          source_port?: string
          target_equipment_id?: string
          target_port?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_source_equipment"
            columns: ["source_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_source_equipment"
            columns: ["source_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_source_equipment"
            columns: ["source_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_source_equipment"
            columns: ["source_equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_target_equipment"
            columns: ["target_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_target_equipment"
            columns: ["target_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_target_equipment"
            columns: ["target_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_target_equipment"
            columns: ["target_equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
        ]
      }
      equipment_parameters: {
        Row: {
          capture_mode: string
          carry_forward: boolean
          constant_value: string | null
          created_at: string | null
          data_type: Database["public"]["Enums"]["parameter_data_type"]
          default_value: string | null
          display_label: string | null
          display_order: number | null
          equipment_id: string | null
          excel_column_index: number | null
          excel_sheet_name: string | null
          excel_workbook: string | null
          frequency: string | null
          help_text: string | null
          hidden_in_modes: string[] | null
          id: string
          input_type: string
          is_active: boolean
          is_constant: boolean | null
          is_graphable: boolean | null
          is_required: boolean
          legacy_name: string | null
          max_value: number | null
          measure: string
          min_value: number | null
          options: Json | null
          parameter_name: string
          semantic_role: string | null
          template_id: string | null
          unit: string | null
          warn_max: number | null
          warn_min: number | null
        }
        Insert: {
          capture_mode?: string
          carry_forward?: boolean
          constant_value?: string | null
          created_at?: string | null
          data_type?: Database["public"]["Enums"]["parameter_data_type"]
          default_value?: string | null
          display_label?: string | null
          display_order?: number | null
          equipment_id?: string | null
          excel_column_index?: number | null
          excel_sheet_name?: string | null
          excel_workbook?: string | null
          frequency?: string | null
          help_text?: string | null
          hidden_in_modes?: string[] | null
          id?: string
          input_type?: string
          is_active?: boolean
          is_constant?: boolean | null
          is_graphable?: boolean | null
          is_required?: boolean
          legacy_name?: string | null
          max_value?: number | null
          measure: string
          min_value?: number | null
          options?: Json | null
          parameter_name: string
          semantic_role?: string | null
          template_id?: string | null
          unit?: string | null
          warn_max?: number | null
          warn_min?: number | null
        }
        Update: {
          capture_mode?: string
          carry_forward?: boolean
          constant_value?: string | null
          created_at?: string | null
          data_type?: Database["public"]["Enums"]["parameter_data_type"]
          default_value?: string | null
          display_label?: string | null
          display_order?: number | null
          equipment_id?: string | null
          excel_column_index?: number | null
          excel_sheet_name?: string | null
          excel_workbook?: string | null
          frequency?: string | null
          help_text?: string | null
          hidden_in_modes?: string[] | null
          id?: string
          input_type?: string
          is_active?: boolean
          is_constant?: boolean | null
          is_graphable?: boolean | null
          is_required?: boolean
          legacy_name?: string | null
          max_value?: number | null
          measure?: string
          min_value?: number | null
          options?: Json | null
          parameter_name?: string
          semantic_role?: string | null
          template_id?: string | null
          unit?: string | null
          warn_max?: number | null
          warn_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_parameters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "equipment_templates"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "equipment_parameters_unit_fk"
            columns: ["unit"]
            isOneToOne: false
            referencedRelation: "unit_definitions"
            referencedColumns: ["unit_code"]
          },
          {
            foreignKeyName: "fk_ep_equipment"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_ep_equipment"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_ep_equipment"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "fk_ep_equipment"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
        ]
      }
      equipment_registry: {
        Row: {
          category: string
          dynamic_parameters: Json
          engine_type: string | null
          equipment_id: string
          excel_row_index: number | null
          firmware_version: string | null
          input_policy: string
          ip_address: string | null
          is_active: boolean | null
          layout_x: number | null
          layout_y: number | null
          location: string
          manufacturer: string | null
          metric_prefix: string | null
          model: string | null
          name: string | null
          provenance: string
          rack_location: string | null
          render_path_d: string | null
          render_shape: string | null
          room_id: string | null
          site_uuid: string | null
          sort_order: number | null
          template_id: string | null
          template_version: number | null
          visible_in_modes: string[] | null
          visit_frequency: string | null
        }
        Insert: {
          category: string
          dynamic_parameters?: Json
          engine_type?: string | null
          equipment_id: string
          excel_row_index?: number | null
          firmware_version?: string | null
          input_policy?: string
          ip_address?: string | null
          is_active?: boolean | null
          layout_x?: number | null
          layout_y?: number | null
          location: string
          manufacturer?: string | null
          metric_prefix?: string | null
          model?: string | null
          name?: string | null
          provenance?: string
          rack_location?: string | null
          render_path_d?: string | null
          render_shape?: string | null
          room_id?: string | null
          site_uuid?: string | null
          sort_order?: number | null
          template_id?: string | null
          template_version?: number | null
          visible_in_modes?: string[] | null
          visit_frequency?: string | null
        }
        Update: {
          category?: string
          dynamic_parameters?: Json
          engine_type?: string | null
          equipment_id?: string
          excel_row_index?: number | null
          firmware_version?: string | null
          input_policy?: string
          ip_address?: string | null
          is_active?: boolean | null
          layout_x?: number | null
          layout_y?: number | null
          location?: string
          manufacturer?: string | null
          metric_prefix?: string | null
          model?: string | null
          name?: string | null
          provenance?: string
          rack_location?: string | null
          render_path_d?: string | null
          render_shape?: string | null
          room_id?: string | null
          site_uuid?: string | null
          sort_order?: number | null
          template_id?: string | null
          template_version?: number | null
          visible_in_modes?: string[] | null
          visit_frequency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_registry_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "equipment_templates"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "equipment_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_status_logs: {
        Row: {
          changed_by: string | null
          created_at: string | null
          equipment_id: string | null
          log_id: string
          status_state: string
          technician_comment: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          equipment_id?: string | null
          log_id?: string
          status_state: string
          technician_comment?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          equipment_id?: string | null
          log_id?: string
          status_state?: string
          technician_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_status_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "equipment_status_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "equipment_status_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "equipment_status_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
        ]
      }
      equipment_templates: {
        Row: {
          capture_parameters: Json | null
          category: string
          created_at: string
          default_parameters: Json
          display_name: string
          engine_type: string | null
          is_active: boolean
          manufacturer: string | null
          model: string | null
          template_id: string
          version: number
        }
        Insert: {
          capture_parameters?: Json | null
          category: string
          created_at?: string
          default_parameters?: Json
          display_name: string
          engine_type?: string | null
          is_active?: boolean
          manufacturer?: string | null
          model?: string | null
          template_id: string
          version?: number
        }
        Update: {
          capture_parameters?: Json | null
          category?: string
          created_at?: string
          default_parameters?: Json
          display_name?: string
          engine_type?: string | null
          is_active?: boolean
          manufacturer?: string | null
          model?: string | null
          template_id?: string
          version?: number
        }
        Relationships: []
      }
      facility_states: {
        Row: {
          fsm_mode: string
          site_uuid: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          fsm_mode?: string
          site_uuid: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          fsm_mode?: string
          site_uuid?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facility_states_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: true
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
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
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_states_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          error_count: number
          filename: string | null
          id: string
          kind: string
          notes: string | null
          promoted_at: string | null
          row_count: number
          site_uuid: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_count?: number
          filename?: string | null
          id?: string
          kind: string
          notes?: string | null
          promoted_at?: string | null
          row_count?: number
          site_uuid: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_count?: number
          filename?: string | null
          id?: string
          kind?: string
          notes?: string | null
          promoted_at?: string | null
          row_count?: number
          site_uuid?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "import_batches_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          batch_id: string
          id: string
          message: string | null
          payload: Json
          source_line: number
          verdict: string
        }
        Insert: {
          batch_id: string
          id?: string
          message?: string | null
          payload: Json
          source_line: number
          verdict?: string
        }
        Update: {
          batch_id?: string
          id?: string
          message?: string | null
          payload?: Json
          source_line?: number
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
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
          provenance: string
          raised_by_id: string
          raised_by_name: string
          receipt_number: string | null
          resolution_details: string | null
          resolution_signature: string | null
          resolution_signed_at: string | null
          resolution_signed_name: string | null
          resolved_at: string | null
          resolved_by_id: string | null
          resolved_by_name: string | null
          resolved_by_type: string | null
          severity: string
          shift_session_id: string | null
          site_name: string
          site_uuid: string | null
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
          provenance?: string
          raised_by_id?: string
          raised_by_name?: string
          receipt_number?: string | null
          resolution_details?: string | null
          resolution_signature?: string | null
          resolution_signed_at?: string | null
          resolution_signed_name?: string | null
          resolved_at?: string | null
          resolved_by_id?: string | null
          resolved_by_name?: string | null
          resolved_by_type?: string | null
          severity: string
          shift_session_id?: string | null
          site_name?: string
          site_uuid?: string | null
          status?: string
          ticket_number?: string
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
          provenance?: string
          raised_by_id?: string
          raised_by_name?: string
          receipt_number?: string | null
          resolution_details?: string | null
          resolution_signature?: string | null
          resolution_signed_at?: string | null
          resolution_signed_name?: string | null
          resolved_at?: string | null
          resolved_by_id?: string | null
          resolved_by_name?: string | null
          resolved_by_type?: string | null
          severity?: string
          shift_session_id?: string | null
          site_name?: string
          site_uuid?: string | null
          status?: string
          ticket_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_shift_session_id_fkey"
            columns: ["shift_session_id"]
            isOneToOne: false
            referencedRelation: "shift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "incidents_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_schedules: {
        Row: {
          basis: string
          created_at: string
          detail: string | null
          equipment_id: string | null
          hours_metric: string | null
          id: string
          interval_days: number | null
          interval_hours: number | null
          is_active: boolean
          last_done_at: string | null
          last_done_hours: number | null
          lead_hours: number
          severity: string
          site_uuid: string
          task: string
          template_id: string | null
        }
        Insert: {
          basis: string
          created_at?: string
          detail?: string | null
          equipment_id?: string | null
          hours_metric?: string | null
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          is_active?: boolean
          last_done_at?: string | null
          last_done_hours?: number | null
          lead_hours?: number
          severity?: string
          site_uuid: string
          task: string
          template_id?: string | null
        }
        Update: {
          basis?: string
          created_at?: string
          detail?: string | null
          equipment_id?: string | null
          hours_metric?: string | null
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          is_active?: boolean
          last_done_at?: string | null
          last_done_hours?: number | null
          lead_hours?: number
          severity?: string
          site_uuid?: string
          task?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "maintenance_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "maintenance_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "maintenance_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "maintenance_schedules_severity_fkey"
            columns: ["severity"]
            isOneToOne: false
            referencedRelation: "sla_targets"
            referencedColumns: ["severity"]
          },
          {
            foreignKeyName: "maintenance_schedules_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "maintenance_schedules_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "equipment_templates"
            referencedColumns: ["template_id"]
          },
        ]
      }
      parameter_excel_targets: {
        Row: {
          column_index: number
          parameter_name: string
          row_rule: string
          sheet_name: string
          site_uuid: string
          workbook: string
        }
        Insert: {
          column_index: number
          parameter_name: string
          row_rule: string
          sheet_name: string
          site_uuid: string
          workbook: string
        }
        Update: {
          column_index?: number
          parameter_name?: string
          row_rule?: string
          sheet_name?: string
          site_uuid?: string
          workbook?: string
        }
        Relationships: [
          {
            foreignKeyName: "parameter_excel_targets_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "parameter_excel_targets_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      readings: {
        Row: {
          equipment_id: string
          parameter_name: string
          provenance: string
          recorded_at: string | null
          room_id: string | null
          shift_session_id: string | null
          site_uuid: string
          target_hour: string
          technician_id: string | null
          technician_name: string | null
          value_num: number | null
          value_text: string | null
        }
        Insert: {
          equipment_id: string
          parameter_name: string
          provenance?: string
          recorded_at?: string | null
          room_id?: string | null
          shift_session_id?: string | null
          site_uuid: string
          target_hour: string
          technician_id?: string | null
          technician_name?: string | null
          value_num?: number | null
          value_text?: string | null
        }
        Update: {
          equipment_id?: string
          parameter_name?: string
          provenance?: string
          recorded_at?: string | null
          room_id?: string | null
          shift_session_id?: string | null
          site_uuid?: string
          target_hour?: string
          technician_id?: string | null
          technician_name?: string | null
          value_num?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_shift_session_id_fkey"
            columns: ["shift_session_id"]
            isOneToOne: false
            referencedRelation: "shift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "readings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      registry_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          field: string
          id: number
          new_value: string | null
          old_value: string | null
          record_key: string
          site_uuid: string | null
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          field: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          record_key: string
          site_uuid?: string | null
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          field?: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          record_key?: string
          site_uuid?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "registry_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registry_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registry_audit_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "registry_audit_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      report_signoffs: {
        Row: {
          created_at: string
          id: string
          period_key: string
          prepared_at: string | null
          prepared_name: string | null
          prepared_signature: string | null
          provenance: string
          report_kind: string
          reviewed_at: string | null
          reviewed_name: string | null
          reviewed_signature: string | null
          site_uuid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          period_key: string
          prepared_at?: string | null
          prepared_name?: string | null
          prepared_signature?: string | null
          provenance?: string
          report_kind: string
          reviewed_at?: string | null
          reviewed_name?: string | null
          reviewed_signature?: string | null
          site_uuid: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          period_key?: string
          prepared_at?: string | null
          prepared_name?: string | null
          prepared_signature?: string | null
          provenance?: string
          report_kind?: string
          reviewed_at?: string | null
          reviewed_name?: string | null
          reviewed_signature?: string | null
          site_uuid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_signoffs_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "report_signoffs_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string | null
          id: string
          label_size: number | null
          label_x: number | null
          label_y: number | null
          layout_h: number | null
          layout_label: string | null
          layout_tint: string | null
          layout_w: number | null
          layout_x: number | null
          layout_y: number | null
          room_name: string
          site_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          label_size?: number | null
          label_x?: number | null
          label_y?: number | null
          layout_h?: number | null
          layout_label?: string | null
          layout_tint?: string | null
          layout_w?: number | null
          layout_x?: number | null
          layout_y?: number | null
          room_name: string
          site_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          label_size?: number | null
          label_x?: number | null
          label_y?: number | null
          layout_h?: number | null
          layout_label?: string | null
          layout_tint?: string | null
          layout_w?: number | null
          layout_x?: number | null
          layout_y?: number | null
          room_name?: string
          site_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "rooms_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_reports: {
        Row: {
          active_power_source: string | null
          certified: boolean | null
          countersign_image: string | null
          countersigned_at: string | null
          countersigned_by: string | null
          countersigned_name: string | null
          incidents_filed: number | null
          log_id: string
          logged_by: string | null
          notes: string | null
          provenance: string
          routine_logs_completed: number | null
          shift_duration: string | null
          shift_session_id: string | null
          signature_id: string | null
          signature_image: string | null
          signed_at: string | null
          site_id: string | null
          site_uuid: string | null
          technician_id: string | null
          technician_name: string | null
          timestamp: string | null
        }
        Insert: {
          active_power_source?: string | null
          certified?: boolean | null
          countersign_image?: string | null
          countersigned_at?: string | null
          countersigned_by?: string | null
          countersigned_name?: string | null
          incidents_filed?: number | null
          log_id?: string
          logged_by?: string | null
          notes?: string | null
          provenance?: string
          routine_logs_completed?: number | null
          shift_duration?: string | null
          shift_session_id?: string | null
          signature_id?: string | null
          signature_image?: string | null
          signed_at?: string | null
          site_id?: string | null
          site_uuid?: string | null
          technician_id?: string | null
          technician_name?: string | null
          timestamp?: string | null
        }
        Update: {
          active_power_source?: string | null
          certified?: boolean | null
          countersign_image?: string | null
          countersigned_at?: string | null
          countersigned_by?: string | null
          countersigned_name?: string | null
          incidents_filed?: number | null
          log_id?: string
          logged_by?: string | null
          notes?: string | null
          provenance?: string
          routine_logs_completed?: number | null
          shift_duration?: string | null
          shift_session_id?: string | null
          signature_id?: string | null
          signature_image?: string | null
          signed_at?: string | null
          site_id?: string | null
          site_uuid?: string | null
          technician_id?: string | null
          technician_name?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_reports_countersigned_by_fkey"
            columns: ["countersigned_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_countersigned_by_fkey"
            columns: ["countersigned_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_shift_session_id_fkey"
            columns: ["shift_session_id"]
            isOneToOne: false
            referencedRelation: "shift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "shift_reports_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_sessions: {
        Row: {
          checked_in_at: string
          checked_out_at: string | null
          created_at: string
          employee_id: string
          id: string
          provenance: string
          shift_type: string
          site_uuid: string
          status: string
        }
        Insert: {
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string
          employee_id: string
          id?: string
          provenance?: string
          shift_type: string
          site_uuid: string
          status?: string
        }
        Update: {
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          provenance?: string
          shift_type?: string
          site_uuid?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_sessions_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "shift_sessions_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_commentary: {
        Row: {
          author_id: string
          author_name: string
          body: string
          created_at: string
          id: string
          is_active: boolean
          note_type: string
          site_uuid: string
        }
        Insert: {
          author_id?: string
          author_name?: string
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          note_type: string
          site_uuid: string
        }
        Update: {
          author_id?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          note_type?: string
          site_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_commentary_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "site_commentary_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          created_at: string | null
          expected_interval_minutes: number
          id: string
          ingestion_grace_minutes: number
          is_active: boolean | null
          monitoring_enabled: boolean
          site_code: string
          site_name: string
        }
        Insert: {
          created_at?: string | null
          expected_interval_minutes?: number
          id?: string
          ingestion_grace_minutes?: number
          is_active?: boolean | null
          monitoring_enabled?: boolean
          site_code: string
          site_name: string
        }
        Update: {
          created_at?: string | null
          expected_interval_minutes?: number
          id?: string
          ingestion_grace_minutes?: number
          is_active?: boolean | null
          monitoring_enabled?: boolean
          site_code?: string
          site_name?: string
        }
        Relationships: []
      }
      sla_targets: {
        Row: {
          description: string | null
          label: string
          resolve_minutes: number
          respond_minutes: number
          severity: string
        }
        Insert: {
          description?: string | null
          label: string
          resolve_minutes: number
          respond_minutes: number
          severity: string
        }
        Update: {
          description?: string | null
          label?: string
          resolve_minutes?: number
          respond_minutes?: number
          severity?: string
        }
        Relationships: []
      }
      telemetry_logs: {
        Row: {
          asset_id: string
          frequency: string
          id: string
          is_edited: boolean | null
          last_edited_at: string | null
          metrics: Json
          provenance: string
          shift_session_id: string | null
          signature_image: string | null
          signed_at: string | null
          site_uuid: string
          submitted_at: string | null
          target_hour: string
          technician_id: string | null
          technician_name: string
        }
        Insert: {
          asset_id: string
          frequency: string
          id?: string
          is_edited?: boolean | null
          last_edited_at?: string | null
          metrics: Json
          provenance?: string
          shift_session_id?: string | null
          signature_image?: string | null
          signed_at?: string | null
          site_uuid: string
          submitted_at?: string | null
          target_hour: string
          technician_id?: string | null
          technician_name: string
        }
        Update: {
          asset_id?: string
          frequency?: string
          id?: string
          is_edited?: boolean | null
          last_edited_at?: string | null
          metrics?: Json
          provenance?: string
          shift_session_id?: string | null
          signature_image?: string | null
          signed_at?: string | null
          site_uuid?: string
          submitted_at?: string | null
          target_hour?: string
          technician_id?: string | null
          technician_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetry_employee"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "fk_telemetry_site"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_logs_shift_session_id_fkey"
            columns: ["shift_session_id"]
            isOneToOne: false
            referencedRelation: "shift_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_definitions: {
        Row: {
          canonical_unit: string
          created_at: string
          dimension: string
          display_name: string
          to_canonical_factor: number
          to_canonical_offset: number
          unit_code: string
        }
        Insert: {
          canonical_unit: string
          created_at?: string
          dimension: string
          display_name: string
          to_canonical_factor?: number
          to_canonical_offset?: number
          unit_code: string
        }
        Update: {
          canonical_unit?: string
          created_at?: string
          dimension?: string
          display_name?: string
          to_canonical_factor?: number
          to_canonical_offset?: number
          unit_code?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          flagged_at: string | null
          flagged_reason: string | null
          id: string
          is_active: boolean
          name: string
          normalised: string
          sla_hours: number | null
          speciality: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string
          is_active?: boolean
          name: string
          normalised: string
          sla_hours?: number | null
          speciality?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string
          is_active?: boolean
          name?: string
          normalised?: string
          sla_hours?: number | null
          speciality?: string | null
        }
        Relationships: []
      }
      walking_path: {
        Row: {
          always_visible: boolean
          equipment_ids: string[]
          name: string
          room_id: string | null
          site_uuid: string
          step_number: number
        }
        Insert: {
          always_visible?: boolean
          equipment_ids?: string[]
          name: string
          room_id?: string | null
          site_uuid: string
          step_number: number
        }
        Update: {
          always_visible?: boolean
          equipment_ids?: string[]
          name?: string
          room_id?: string | null
          site_uuid?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "walking_path_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walking_path_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "walking_path_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_acks: {
        Row: {
          acknowledged_at: string
          employee_id: string
          work_item_id: string
        }
        Insert: {
          acknowledged_at?: string
          employee_id: string
          work_item_id: string
        }
        Update: {
          acknowledged_at?: string
          employee_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_acks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_acks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_acks_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_acks_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      work_items: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          assigned_scope: string | null
          assigned_to: string[] | null
          assignee_id: string | null
          breach_max: number | null
          breach_min: number | null
          breach_value: number | null
          created_at: string
          created_by: string | null
          detail: string | null
          due_at: string | null
          id: string
          kind: string
          origin: string
          provenance: string
          resolution_note: string | null
          resolve_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          respond_by: string | null
          severity: string
          signature_image: string | null
          signed_at: string | null
          signed_name: string | null
          site_uuid: string
          source_kind: string | null
          source_ref: string | null
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_scope?: string | null
          assigned_to?: string[] | null
          assignee_id?: string | null
          breach_max?: number | null
          breach_min?: number | null
          breach_value?: number | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_at?: string | null
          id?: string
          kind: string
          origin?: string
          provenance?: string
          resolution_note?: string | null
          resolve_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          respond_by?: string | null
          severity: string
          signature_image?: string | null
          signed_at?: string | null
          signed_name?: string | null
          site_uuid: string
          source_kind?: string | null
          source_ref?: string | null
          state?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_scope?: string | null
          assigned_to?: string[] | null
          assignee_id?: string | null
          breach_max?: number | null
          breach_min?: number | null
          breach_value?: number | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          origin?: string
          provenance?: string
          resolution_note?: string | null
          resolve_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          respond_by?: string | null
          severity?: string
          signature_image?: string | null
          signed_at?: string | null
          signed_name?: string | null
          site_uuid?: string
          source_kind?: string | null
          source_ref?: string | null
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_severity_fkey"
            columns: ["severity"]
            isOneToOne: false
            referencedRelation: "sla_targets"
            referencedColumns: ["severity"]
          },
          {
            foreignKeyName: "work_items_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "work_items_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employee_directory: {
        Row: {
          employee_id: string | null
          full_name: string | null
          id: string | null
          role: string | null
          site_uuid: string | null
        }
        Insert: {
          employee_id?: string | null
          full_name?: string | null
          id?: string | null
          role?: string | null
          site_uuid?: string | null
        }
        Update: {
          employee_id?: string | null
          full_name?: string | null
          id?: string | null
          role?: string | null
          site_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "employees_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_condition: {
        Row: {
          category: string | null
          condition: string | null
          equipment_id: string | null
          is_active: boolean | null
          last_comment: string | null
          last_flagged_at: string | null
          last_flagged_by: string | null
          last_flagged_state: string | null
          name: string | null
          room_id: string | null
          site_uuid: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_roles: {
        Row: {
          category: string | null
          engine_type: string | null
          equipment_id: string | null
          has_parameters: boolean | null
          is_drawn: boolean | null
          is_simulated: boolean | null
          metric_prefix: string | null
          name: string | null
          role: string | null
          site_uuid: string | null
        }
        Insert: {
          category?: string | null
          engine_type?: string | null
          equipment_id?: string | null
          has_parameters?: never
          is_drawn?: never
          is_simulated?: never
          metric_prefix?: string | null
          name?: string | null
          role?: never
          site_uuid?: string | null
        }
        Update: {
          category?: string | null
          engine_type?: string | null
          equipment_id?: string | null
          has_parameters?: never
          is_drawn?: never
          is_simulated?: never
          metric_prefix?: string | null
          name?: string | null
          role?: never
          site_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_due: {
        Row: {
          basis: string | null
          current_hours: number | null
          detail: string | null
          due_at_hours: number | null
          due_date: string | null
          equipment_name: string | null
          hours_remaining: number | null
          last_done_at: string | null
          last_done_hours: number | null
          lead_hours: number | null
          schedule_id: string | null
          severity: string | null
          site_uuid: string | null
          status: string | null
          target_equipment: string | null
          task: string | null
        }
        Relationships: []
      }
      parameter_observed_range: {
        Row: {
          answered_na: number | null
          category: string | null
          display_label: string | null
          equipment_id: string | null
          equipment_name: string | null
          first_seen: string | null
          last_seen: string | null
          max_value: number | null
          min_value: number | null
          numeric_readings: number | null
          observed_avg: number | null
          observed_max: number | null
          observed_min: number | null
          p05: number | null
          p95: number | null
          parameter_name: string | null
          readings: number | null
          room_name: string | null
          site_uuid: string | null
          unit: string | null
          warn_max: number | null
          warn_min: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_parameters_unit_fk"
            columns: ["unit"]
            isOneToOne: false
            referencedRelation: "unit_definitions"
            referencedColumns: ["unit_code"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "readings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      readings_daily: {
        Row: {
          bucket: string | null
          equipment_id: string | null
          max_num: number | null
          measure: string | null
          min_num: number | null
          n: number | null
          n_breach: number | null
          n_na: number | null
          n_numeric: number | null
          n_technicians: number | null
          n_warn: number | null
          n_zero: number | null
          parameter_name: string | null
          room_id: string | null
          site_uuid: string | null
          sum_num: number | null
        }
        Relationships: [
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "readings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      readings_monthly: {
        Row: {
          bucket: string | null
          equipment_id: string | null
          max_num: number | null
          measure: string | null
          min_num: number | null
          n: number | null
          n_breach: number | null
          n_na: number | null
          n_numeric: number | null
          n_technicians: number | null
          n_warn: number | null
          n_zero: number | null
          parameter_name: string | null
          room_id: string | null
          site_uuid: string | null
          sum_num: number | null
        }
        Relationships: [
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_condition"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_registry"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_roles"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "topology_layout_issues"
            referencedColumns: ["equipment_id"]
          },
          {
            foreignKeyName: "readings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "readings_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_job_status: {
        Row: {
          active: boolean | null
          jobname: string | null
          last_run: string | null
          last_status: string | null
          return_message: string | null
          schedule: string | null
        }
        Relationships: []
      }
      site_ingestion_health: {
        Row: {
          avg_lag_minutes: number | null
          entries_7d: number | null
          entry_status: string | null
          expected_interval_minutes: number | null
          ingestion_grace_minutes: number | null
          last_late_at: string | null
          last_late_technician: string | null
          last_reading_at: string | null
          last_technician: string | null
          late_entries_7d: number | null
          minutes_since_reading: number | null
          monitoring_enabled: boolean | null
          site_code: string | null
          site_name: string | null
          site_uuid: string | null
          status: string | null
          worst_lag_minutes: number | null
        }
        Relationships: []
      }
      topology_graph_issues: {
        Row: {
          detail: string | null
          equipment_id: string | null
          issue: string | null
          site_uuid: string | null
        }
        Relationships: []
      }
      topology_layout_issues: {
        Row: {
          detail: string | null
          equipment_id: string | null
          issue: string | null
          site_uuid: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "equipment_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_activity: {
        Row: {
          findings: number | null
          flagged_at: string | null
          flagged_reason: string | null
          is_active: boolean | null
          last_visit: string | null
          open_work: number | null
          serious_findings: number | null
          sla_hours: number | null
          speciality: string | null
          vendor_id: string | null
          vendor_name: string | null
          visits: number | null
        }
        Relationships: []
      }
      work_queue: {
        Row: {
          ack_count: number | null
          acknowledged_at: string | null
          assigned_count: number | null
          assigned_scope: string | null
          assigned_to: string[] | null
          assignee_id: string | null
          assignee_name: string | null
          created_at: string | null
          detail: string | null
          due_at: string | null
          i_acknowledged: boolean | null
          id: string | null
          is_breached: boolean | null
          kind: string | null
          origin: string | null
          overdue_minutes: number | null
          resolve_by: string | null
          respond_by: string | null
          response_breached: boolean | null
          severity: string | null
          severity_label: string | null
          site_uuid: string | null
          sla_status: string | null
          source_kind: string | null
          source_ref: string | null
          state: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_severity_fkey"
            columns: ["severity"]
            isOneToOne: false
            referencedRelation: "sla_targets"
            referencedColumns: ["severity"]
          },
          {
            foreignKeyName: "work_items_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "site_ingestion_health"
            referencedColumns: ["site_uuid"]
          },
          {
            foreignKeyName: "work_items_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acknowledge_work_item: { Args: { p_id: string }; Returns: undefined }
      admin_create_employee: {
        Args: {
          p_auth_id: string
          p_email: string
          p_employee_id: string
          p_full_name: string
          p_phone_number?: string
          p_role: string
          p_site_id: string
          p_site_uuid: string
        }
        Returns: {
          auth_id: string | null
          created_at: string | null
          email: string
          employee_id: string
          full_name: string
          id: string
          phone_number: string | null
          role: string
          site_id: string
          site_uuid: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      append_incident_comment: {
        Args: { p_comment: Json; p_incident_id: string }
        Returns: {
          asset_id: string
          comments: Json
          contractor_engaged: string | null
          created_at: string | null
          id: string
          impact: string | null
          notes: string | null
          occurred_at: string
          photo_url: string | null
          provenance: string
          raised_by_id: string
          raised_by_name: string
          receipt_number: string | null
          resolution_details: string | null
          resolution_signature: string | null
          resolution_signed_at: string | null
          resolution_signed_name: string | null
          resolved_at: string | null
          resolved_by_id: string | null
          resolved_by_name: string | null
          resolved_by_type: string | null
          severity: string
          shift_session_id: string | null
          site_name: string
          site_uuid: string | null
          status: string
          ticket_number: string
        }
        SetofOptions: {
          from: "*"
          to: "incidents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_template_parameters: {
        Args: {
          p_equipment_id: string
          p_frequency?: string
          p_template_id?: string
        }
        Returns: number
      }
      check_ingestion_health: {
        Args: never
        Returns: {
          out_action: string
          out_site_code: string
          out_status: string
        }[]
      }
      derive_measure: {
        Args: { p_equipment_id: string; p_parameter_name: string }
        Returns: string
      }
      evaluate_thresholds: {
        Args: { p_site_uuid?: string }
        Returns: {
          out_equipment: string
          out_parameter: string
          out_raised: boolean
          out_severity: string
          out_source_ref: string
          out_value: number
        }[]
      }
      fan_out_readings: { Args: { p_log_id: string }; Returns: number }
      generate_synthetic_readings: {
        Args: {
          p_from: string
          p_rounds_per_day?: number
          p_site_uuid: string
          p_to: string
        }
        Returns: string
      }
      generate_synthetic_reports: {
        Args: { p_from: string; p_site_uuid: string; p_to: string }
        Returns: string
      }
      generate_ticket_number: { Args: never; Returns: string }
      get_asset_freshness: {
        Args: { p_site_uuid?: string }
        Returns: {
          asset_condition: string
          category: string
          covered_last_round: number
          equipment_id: string
          last_reading: string
          last_technician: string
          name: string
          readings_24h: number
          room_id: string
          room_name: string
          typical_round: number
        }[]
      }
      get_asset_history: {
        Args: { p_equipment_id: string; p_limit?: number }
        Returns: {
          changed_at: string
          changed_by_name: string
          field: string
          new_value: string
          old_value: string
          scope: string
          target: string
        }[]
      }
      get_capacity_summary: { Args: { p_site_uuid?: string }; Returns: Json }
      get_late_entries: {
        Args: {
          p_from: string
          p_late_only?: boolean
          p_site_uuid: string
          p_to: string
        }
        Returns: {
          frequency: string
          is_late: boolean
          lag_minutes: number
          log_id: string
          n_readings: number
          provenance: string
          shift_session_id: string
          submitted_at: string
          target_hour: string
          technician_id: string
          technician_name: string
          tolerance_minutes: number
        }[]
      }
      get_late_entry_by_technician: {
        Args: { p_from: string; p_site_uuid: string; p_to: string }
        Returns: {
          avg_lag_minutes: number
          last_late_at: string
          late_share: number
          n_entries: number
          n_late: number
          technician_id: string
          technician_name: string
          worst_lag_minutes: number
        }[]
      }
      get_load_accumulation: {
        Args: { p_site_uuid?: string }
        Returns: {
          capacity: number
          carried_load_kw: number
          engine_type: string
          equipment_id: string
          feeder_count: number
          headroom_kw: number
          load_pct: number
          name: string
          own_load_kw: number
        }[]
      }
      get_measure_volumes: {
        Args: {
          p_categories?: string[]
          p_from: string
          p_site_uuid: string
          p_to: string
        }
        Returns: {
          assets: number
          last_seen: string
          measure: string
          n: number
          n_numeric: number
          n_zero: number
          rooms: number
        }[]
      }
      get_my_employee_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      get_my_site_uuid: { Args: never; Returns: string }
      get_redundancy_analysis: {
        Args: { p_site_uuid?: string }
        Returns: {
          feeder_count: number
          feeders: string[]
          input_policy: string
          load_after_failure_kw: number
          n_plus_1_headroom_kw: number
          n_plus_1_ok: boolean
          surviving_capacity_kw: number
          target_id: string
          target_name: string
          total_load_kw: number
        }[]
      }
      get_series: {
        Args: {
          p_equipment_id?: string
          p_from: string
          p_grain?: string
          p_group_by?: string
          p_measure?: string
          p_parameter_name?: string
          p_room_id?: string
          p_site_uuid: string
          p_to: string
        }
        Returns: {
          avg_num: number
          bucket: string
          equipment_id: string
          max_num: number
          min_num: number
          n: number
          n_breach: number
          n_na: number
          n_numeric: number
          n_warn: number
          n_zero: number
          parameter_name: string
          room_id: string
          room_name: string
        }[]
      }
      get_site_form_definition: {
        Args: {
          p_frequency?: string
          p_fsm_mode?: string
          p_site_uuid?: string
        }
        Returns: Json
      }
      get_sla_breaches: {
        Args: { p_site_uuid?: string }
        Returns: {
          out_assignee: string
          out_id: string
          out_kind: string
          out_origin: string
          out_overdue_hours: number
          out_severity: string
          out_state: string
          out_title: string
        }[]
      }
      get_sla_performance: {
        Args: { p_since?: string; p_site_uuid?: string }
        Returns: Json
      }
      get_technician_activity: {
        Args: { p_from: string; p_site_uuid: string; p_to: string }
        Returns: {
          first_seen: string
          last_seen: string
          n_assets: number
          n_breach: number
          n_days: number
          n_na: number
          n_numeric: number
          n_readings: number
          n_rooms: number
          n_shifts: number
          n_zero: number
          technician_id: string
          technician_name: string
        }[]
      }
      get_topology_graph: { Args: { p_site_uuid?: string }; Returns: Json }
      normalise_vendor: { Args: { p_name: string }; Returns: string }
      parameter_for_role: {
        Args: { p_equipment_id: string; p_role: string }
        Returns: {
          capture_mode: string
          carry_forward: boolean
          constant_value: string | null
          created_at: string | null
          data_type: Database["public"]["Enums"]["parameter_data_type"]
          default_value: string | null
          display_label: string | null
          display_order: number | null
          equipment_id: string | null
          excel_column_index: number | null
          excel_sheet_name: string | null
          excel_workbook: string | null
          frequency: string | null
          help_text: string | null
          hidden_in_modes: string[] | null
          id: string
          input_type: string
          is_active: boolean
          is_constant: boolean | null
          is_graphable: boolean | null
          is_required: boolean
          legacy_name: string | null
          max_value: number | null
          measure: string
          min_value: number | null
          options: Json | null
          parameter_name: string
          semantic_role: string | null
          template_id: string | null
          unit: string | null
          warn_max: number | null
          warn_min: number | null
        }
        SetofOptions: {
          from: "*"
          to: "equipment_parameters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      promote_import_batch: { Args: { p_batch_id: string }; Returns: Json }
      purge_synthetic_data: { Args: { p_site_uuid?: string }; Returns: string }
      raise_due_maintenance: { Args: { p_site_uuid?: string }; Returns: number }
      raise_work_item: {
        Args: {
          p_assignee?: string
          p_detail?: string
          p_kind?: string
          p_origin?: string
          p_severity: string
          p_site_uuid: string
          p_source_kind?: string
          p_source_ref?: string
          p_title: string
        }
        Returns: string
      }
      rand_normal: { Args: never; Returns: number }
      reading_status: {
        Args: {
          p_max: number
          p_min: number
          p_value: number
          p_warn_max: number
          p_warn_min: number
        }
        Returns: string
      }
      record_contractor_finding: {
        Args: {
          p_detail?: string
          p_equipment_id?: string
          p_raise_work?: boolean
          p_severity?: string
          p_summary: string
          p_visit_id: string
        }
        Returns: string
      }
      refresh_reading_rollups: { Args: never; Returns: string }
      resolve_equipment_parameters: {
        Args: { p_equipment_id: string }
        Returns: {
          canonical_unit: string
          capture_mode: string
          carry_forward: boolean
          constant_value: string
          data_type: Database["public"]["Enums"]["parameter_data_type"]
          default_value: string
          dimension: string
          display_label: string
          display_order: number
          frequency: string
          help_text: string
          hidden_in_modes: string[]
          input_type: string
          is_constant: boolean
          is_graphable: boolean
          is_required: boolean
          max_value: number
          min_value: number
          options: Json
          parameter_name: string
          source: string
          unit: string
        }[]
      }
      resolve_recovered_thresholds: {
        Args: { p_site_uuid?: string }
        Returns: number
      }
      seed_it_rack_parameters: {
        Args: { p_equipment_id: string }
        Returns: string
      }
      severity_from_excursion: {
        Args: { p_max: number; p_min: number; p_value: number }
        Returns: string
      }
      start_work_item: { Args: { p_id: string }; Returns: undefined }
      to_base36: { Args: { p_n: number }; Returns: string }
      to_canonical: {
        Args: { p_unit: string; p_value: number }
        Returns: number
      }
      to_number_or_null: { Args: { p_raw: string }; Returns: number }
      validate_import_batch: {
        Args: { p_batch_id: string }
        Returns: {
          out_rows: number
          out_verdict: string
        }[]
      }
    }
    Enums: {
      parameter_data_type: "number" | "string" | "boolean"
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
    Enums: {
      parameter_data_type: ["number", "string", "boolean"],
    },
  },
} as const
