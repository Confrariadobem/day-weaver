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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      calendar_events: {
        Row: {
          all_day: boolean | null
          color: string | null
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          recurrence_rule: string | null
          start_time: string
          task_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean | null
          color?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          recurrence_rule?: string | null
          start_time: string
          task_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean | null
          color?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          recurrence_rule?: string | null
          start_time?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_expense: boolean | null
          is_project: boolean | null
          is_revenue: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_expense?: boolean | null
          is_project?: boolean | null
          is_revenue?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_expense?: boolean | null
          is_project?: boolean | null
          is_revenue?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          entry_date: string
          id: string
          installment_group: string | null
          installment_number: number | null
          project_id: string | null
          title: string
          total_installments: number | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          installment_group?: string | null
          installment_number?: number | null
          project_id?: string | null
          title: string
          total_installments?: number | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          installment_group?: string | null
          installment_number?: number | null
          project_id?: string | null
          title?: string
          total_installments?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          theme_preference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          theme_preference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          theme_preference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_completed: boolean | null
          is_favorite: boolean | null
          project_id: string | null
          scheduled_date: string | null
          sort_order: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          is_favorite?: boolean | null
          project_id?: string | null
          scheduled_date?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          is_favorite?: boolean | null
          project_id?: string | null
          scheduled_date?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
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
