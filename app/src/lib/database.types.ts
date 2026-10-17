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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          address: string | null
          books_changed_at: string
          business_name: string | null
          currency: string
          drive_folder_id: string | null
          drive_projects_folder_id: string | null
          drive_proposals_folder_id: string | null
          drive_receipts_folder_id: string | null
          drive_tracker_file_id: string | null
          email: string | null
          expense_payment_methods: Json
          gst_number: string | null
          hours_per_day: number
          id: number
          income_payment_methods: Json
          job_seq_next: number
          job_seq_start: number
          job_seq_year: number
          logo_url: string | null
          payment_terms: string | null
          phone: string | null
          proposal_terms: string | null
          pst_number: string | null
          signature_url: string | null
          tax_lines: Json
          tracker_synced_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          books_changed_at?: string
          business_name?: string | null
          currency?: string
          drive_folder_id?: string | null
          drive_projects_folder_id?: string | null
          drive_proposals_folder_id?: string | null
          drive_receipts_folder_id?: string | null
          drive_tracker_file_id?: string | null
          email?: string | null
          expense_payment_methods?: Json
          gst_number?: string | null
          hours_per_day?: number
          id?: number
          income_payment_methods?: Json
          job_seq_next?: number
          job_seq_start?: number
          job_seq_year?: number
          logo_url?: string | null
          payment_terms?: string | null
          phone?: string | null
          proposal_terms?: string | null
          pst_number?: string | null
          signature_url?: string | null
          tax_lines?: Json
          tracker_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          books_changed_at?: string
          business_name?: string | null
          currency?: string
          drive_folder_id?: string | null
          drive_projects_folder_id?: string | null
          drive_proposals_folder_id?: string | null
          drive_receipts_folder_id?: string | null
          drive_tracker_file_id?: string | null
          email?: string | null
          expense_payment_methods?: Json
          gst_number?: string | null
          hours_per_day?: number
          id?: number
          income_payment_methods?: Json
          job_seq_next?: number
          job_seq_start?: number
          job_seq_year?: number
          logo_url?: string | null
          payment_terms?: string | null
          phone?: string | null
          proposal_terms?: string | null
          pst_number?: string | null
          signature_url?: string | null
          tax_lines?: Json
          tracker_synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          body: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          category_id: string | null
          city: string | null
          created_at: string
          created_by: string | null
          default_rate: number | null
          email: string | null
          id: string
          is_individual: boolean
          is_internal: boolean
          latest_note: string | null
          latest_note_at: string | null
          name: string
          phone: string | null
          postal_code: string | null
          province: string | null
          status: string
          street: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          default_rate?: number | null
          email?: string | null
          id?: string
          is_individual?: boolean
          is_internal?: boolean
          latest_note?: string | null
          latest_note_at?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: string
          street?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          default_rate?: number | null
          email?: string | null
          id?: string
          is_individual?: boolean
          is_internal?: boolean
          latest_note?: string | null
          latest_note_at?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: string
          street?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "client_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          billable: boolean
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          invoice_id: string | null
          markup_pct: number
          notes: string | null
          payment_method: string | null
          project_id: string | null
          receipt_drive_id: string | null
          receipt_drive_url: string | null
          receipt_name: string | null
          receipt_url: string | null
          tax_amount: number
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          billable?: boolean
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          invoice_id?: string | null
          markup_pct?: number
          notes?: string | null
          payment_method?: string | null
          project_id?: string | null
          receipt_drive_id?: string | null
          receipt_drive_url?: string | null
          receipt_name?: string | null
          receipt_url?: string | null
          tax_amount?: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          billable?: boolean
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          invoice_id?: string | null
          markup_pct?: number
          notes?: string | null
          payment_method?: string | null
          project_id?: string | null
          receipt_drive_id?: string | null
          receipt_drive_url?: string | null
          receipt_name?: string | null
          receipt_url?: string | null
          tax_amount?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_costs: {
        Row: {
          annual_cost: number
          category_id: string | null
          created_at: string
          id: string
          item: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          annual_cost?: number
          category_id?: string | null
          created_at?: string
          id?: string
          item?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          annual_cost?: number
          category_id?: string | null
          created_at?: string
          id?: string
          item?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_costs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      income: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          income_date: string
          invoice_id: string | null
          payment_method: string | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          income_date?: string
          invoice_id?: string | null
          payment_method?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          income_date?: string
          invoice_id?: string | null
          payment_method?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          apply_taxes: boolean
          created_at: string
          created_by: string | null
          doc_mode: string
          due_date: string | null
          id: string
          issue_date: string
          line_items: Json
          notes: string | null
          number: string | null
          paid_date: string | null
          payment_method: string | null
          prepared_by: string | null
          progress_lines: Json
          project_id: string
          sections: Json
          sent_date: string | null
          source_drive_id: string | null
          source_drive_url: string | null
          source_name: string | null
          status: string
          subtotal: number
          tax_lines: Json
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          apply_taxes?: boolean
          created_at?: string
          created_by?: string | null
          doc_mode?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          number?: string | null
          paid_date?: string | null
          payment_method?: string | null
          prepared_by?: string | null
          progress_lines?: Json
          project_id: string
          sections?: Json
          sent_date?: string | null
          source_drive_id?: string | null
          source_drive_url?: string | null
          source_name?: string | null
          status?: string
          subtotal?: number
          tax_lines?: Json
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          apply_taxes?: boolean
          created_at?: string
          created_by?: string | null
          doc_mode?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          number?: string | null
          paid_date?: string | null
          payment_method?: string | null
          prepared_by?: string | null
          progress_lines?: Json
          project_id?: string
          sections?: Json
          sent_date?: string | null
          source_drive_id?: string | null
          source_drive_url?: string | null
          source_name?: string | null
          status?: string
          subtotal?: number
          tax_lines?: Json
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      keepalive: {
        Row: {
          id: number
          last_seen: string
        }
        Insert: {
          id: number
          last_seen?: string
        }
        Update: {
          id?: number
          last_seen?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number | null
          client_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          deliverables: Json
          description: string | null
          due_date: string | null
          hourly_rate: number | null
          id: string
          next_invoice_seq: number
          number: string | null
          scope: string
          source_pdf_path: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          client_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deliverables?: Json
          description?: string | null
          due_date?: string | null
          hourly_rate?: number | null
          id?: string
          next_invoice_seq?: number
          number?: string | null
          scope?: string
          source_pdf_path?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          client_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deliverables?: Json
          description?: string | null
          due_date?: string | null
          hourly_rate?: number | null
          id?: string
          next_invoice_seq?: number
          number?: string | null
          scope?: string
          source_pdf_path?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          proposal_id: string
          revised_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          proposal_id: string
          revised_on?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          proposal_id?: string
          revised_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_revisions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_line_items: Json
          id: string
          name: string
          sections: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_line_items?: Json
          id?: string
          name: string
          sections?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_line_items?: Json
          id?: string
          name?: string
          sections?: Json
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          client_id: string
          converted_project_id: string | null
          created_at: string
          created_by: string | null
          decided_date: string | null
          doc_mode: string
          id: string
          line_items: Json
          number: string | null
          project_scope: string
          sections: Json
          sent_date: string | null
          source_pdf_path: string | null
          status: string
          subtotal: number
          template_id: string | null
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_id: string
          converted_project_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_date?: string | null
          doc_mode?: string
          id?: string
          line_items?: Json
          number?: string | null
          project_scope?: string
          sections?: Json
          sent_date?: string | null
          source_pdf_path?: string | null
          status?: string
          subtotal?: number
          template_id?: string | null
          title: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          converted_project_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_date?: string | null
          doc_mode?: string
          id?: string
          line_items?: Json
          number?: string | null
          project_scope?: string
          sections?: Json
          sent_date?: string | null
          source_pdf_path?: string | null
          status?: string
          subtotal?: number
          template_id?: string | null
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_converted_project_id_fkey"
            columns: ["converted_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_tiers: {
        Row: {
          created_at: string
          hourly_rate: number | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          billable: boolean
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          invoice_id: string | null
          minutes: number
          project_id: string
          rate: number | null
          updated_at: string
        }
        Insert: {
          billable?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
          minutes?: number
          project_id: string
          rate?: number | null
          updated_at?: string
        }
        Update: {
          billable?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
          minutes?: number
          project_id?: string
          rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_internal_project: { Args: never; Returns: string }
      next_invoice_number: { Args: { p_project_id: string }; Returns: string }
      next_job_number: { Args: never; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
