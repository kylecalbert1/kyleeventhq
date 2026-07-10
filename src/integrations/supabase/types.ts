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
      event_milestones: {
        Row: {
          created_at: string
          doc_link: string | null
          event_id: string
          id: string
          key_action_items: string | null
          recap_link: string | null
          scheduled_date: string | null
          status: Database["public"]["Enums"]["milestone_status"]
          type: Database["public"]["Enums"]["milestone_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_link?: string | null
          event_id: string
          id?: string
          key_action_items?: string | null
          recap_link?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          type: Database["public"]["Enums"]["milestone_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_link?: string | null
          event_id?: string
          id?: string
          key_action_items?: string | null
          recap_link?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          type?: Database["public"]["Enums"]["milestone_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_milestones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          business_line: Database["public"]["Enums"]["business_line"]
          code: string
          created_at: string
          event_date: string | null
          final_signoff_due: string | null
          format: Database["public"]["Enums"]["event_format"]
          id: string
          kickoff_date: string | null
          launch_date: string | null
          name: string
          owner: string | null
          proof1_done: boolean
          proof1_due: string | null
          proof2_done: boolean
          proof2_due: string | null
          self_status: Database["public"]["Enums"]["self_status"]
          signoff_done: boolean
          updated_at: string
          venue: string | null
          washup_date: string | null
          website_status: Database["public"]["Enums"]["website_stage"]
        }
        Insert: {
          business_line: Database["public"]["Enums"]["business_line"]
          code: string
          created_at?: string
          event_date?: string | null
          final_signoff_due?: string | null
          format: Database["public"]["Enums"]["event_format"]
          id?: string
          kickoff_date?: string | null
          launch_date?: string | null
          name: string
          owner?: string | null
          proof1_done?: boolean
          proof1_due?: string | null
          proof2_done?: boolean
          proof2_due?: string | null
          self_status?: Database["public"]["Enums"]["self_status"]
          signoff_done?: boolean
          updated_at?: string
          venue?: string | null
          washup_date?: string | null
          website_status?: Database["public"]["Enums"]["website_stage"]
        }
        Update: {
          business_line?: Database["public"]["Enums"]["business_line"]
          code?: string
          created_at?: string
          event_date?: string | null
          final_signoff_due?: string | null
          format?: Database["public"]["Enums"]["event_format"]
          id?: string
          kickoff_date?: string | null
          launch_date?: string | null
          name?: string
          owner?: string | null
          proof1_done?: boolean
          proof1_due?: string | null
          proof2_done?: boolean
          proof2_due?: string | null
          self_status?: Database["public"]["Enums"]["self_status"]
          signoff_done?: boolean
          updated_at?: string
          venue?: string | null
          washup_date?: string | null
          website_status?: Database["public"]["Enums"]["website_stage"]
        }
        Relationships: []
      }
      outreach_accounts: {
        Row: {
          account_name: string
          camp_a_done: boolean
          camp_a_template: string | null
          camp_b_done: boolean
          camp_b_template: string | null
          created_at: string
          event_id: string | null
          id: string
          inmail_done: boolean
          inmail_template: string | null
          li_invite_done: boolean
          li_invite_template: string | null
          notes: string | null
          owner: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          account_name: string
          camp_a_done?: boolean
          camp_a_template?: string | null
          camp_b_done?: boolean
          camp_b_template?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          inmail_done?: boolean
          inmail_template?: string | null
          li_invite_done?: boolean
          li_invite_template?: string | null
          notes?: string | null
          owner?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          account_name?: string
          camp_a_done?: boolean
          camp_a_template?: string | null
          camp_b_done?: boolean
          camp_b_template?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          inmail_done?: boolean
          inmail_template?: string | null
          li_invite_done?: boolean
          li_invite_template?: string | null
          notes?: string | null
          owner?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_accounts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      speakers: {
        Row: {
          banner_status: Database["public"]["Enums"]["banner_status"]
          bio_received: boolean
          company: string | null
          created_at: string
          dropbox_link: string | null
          email: string | null
          event_id: string
          headshot_received: boolean
          id: string
          linkedin_post_confirmed: boolean
          linkedin_url: string | null
          name: string
          notes: string | null
          outreach_channel:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          session_format: Database["public"]["Enums"]["session_format"] | null
          session_title: string | null
          status: Database["public"]["Enums"]["speaker_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          banner_status?: Database["public"]["Enums"]["banner_status"]
          bio_received?: boolean
          company?: string | null
          created_at?: string
          dropbox_link?: string | null
          email?: string | null
          event_id: string
          headshot_received?: boolean
          id?: string
          linkedin_post_confirmed?: boolean
          linkedin_url?: string | null
          name: string
          notes?: string | null
          outreach_channel?:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          session_format?: Database["public"]["Enums"]["session_format"] | null
          session_title?: string | null
          status?: Database["public"]["Enums"]["speaker_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          banner_status?: Database["public"]["Enums"]["banner_status"]
          bio_received?: boolean
          company?: string | null
          created_at?: string
          dropbox_link?: string | null
          email?: string | null
          event_id?: string
          headshot_received?: boolean
          id?: string
          linkedin_post_confirmed?: boolean
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          outreach_channel?:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          session_format?: Database["public"]["Enums"]["session_format"] | null
          session_title?: string | null
          status?: Database["public"]["Enums"]["speaker_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          banner_status: Database["public"]["Enums"]["banner_status"]
          created_at: string
          dropbox_link: string | null
          event_id: string
          id: string
          linkedin_post_confirmed: boolean
          name: string
          session_type: string | null
          spend_tier: string | null
          updated_at: string
        }
        Insert: {
          banner_status?: Database["public"]["Enums"]["banner_status"]
          created_at?: string
          dropbox_link?: string | null
          event_id: string
          id?: string
          linkedin_post_confirmed?: boolean
          name: string
          session_type?: string | null
          spend_tier?: string | null
          updated_at?: string
        }
        Update: {
          banner_status?: Database["public"]["Enums"]["banner_status"]
          created_at?: string
          dropbox_link?: string | null
          event_id?: string
          id?: string
          linkedin_post_confirmed?: boolean
          name?: string
          session_type?: string | null
          spend_tier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      team_checklist_items: {
        Row: {
          category: Database["public"]["Enums"]["checklist_category"]
          created_at: string
          done: boolean
          id: string
          position: number
          text: string
          updated_at: string
          week_start: string
        }
        Insert: {
          category: Database["public"]["Enums"]["checklist_category"]
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          text: string
          updated_at?: string
          week_start: string
        }
        Update: {
          category?: Database["public"]["Enums"]["checklist_category"]
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          text?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      website_tasks: {
        Row: {
          assignee: string | null
          created_at: string
          due_date: string | null
          event_id: string
          id: string
          protected: boolean
          status: Database["public"]["Enums"]["website_stage"]
          task_type: Database["public"]["Enums"]["website_task_type"]
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          due_date?: string | null
          event_id: string
          id?: string
          protected?: boolean
          status?: Database["public"]["Enums"]["website_stage"]
          task_type: Database["public"]["Enums"]["website_task_type"]
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          due_date?: string | null
          event_id?: string
          id?: string
          protected?: boolean
          status?: Database["public"]["Enums"]["website_stage"]
          task_type?: Database["public"]["Enums"]["website_task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_priorities: {
        Row: {
          created_at: string
          done: boolean
          id: string
          position: number
          text: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          position: number
          text?: string
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          text?: string
          updated_at?: string
          user_id?: string
          week_start?: string
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
      banner_status: "not_started" | "created" | "sent" | "confirmed_live"
      business_line: "AIAI" | "CSC"
      checklist_category: "sales" | "marketing" | "content" | "community"
      event_format: "in_person" | "virtual"
      milestone_status: "scheduled" | "done"
      milestone_type: "kickoff" | "washup"
      outreach_channel:
        | "linkedin_connect"
        | "group_message"
        | "old_attendee_list"
        | "warm_intro"
        | "cold_email"
      self_status: "on_track" | "needs_attention" | "off_track"
      session_format: "keynote" | "panel" | "workshop" | "fireside"
      speaker_status: "contacted" | "responded" | "confirmed" | "declined"
      website_stage: "draft" | "proof_1" | "proof_2" | "signed_off" | "live"
      website_task_type:
        | "proof_1"
        | "proof_2"
        | "final_signoff"
        | "launch"
        | "audit"
        | "refresh"
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
      banner_status: ["not_started", "created", "sent", "confirmed_live"],
      business_line: ["AIAI", "CSC"],
      checklist_category: ["sales", "marketing", "content", "community"],
      event_format: ["in_person", "virtual"],
      milestone_status: ["scheduled", "done"],
      milestone_type: ["kickoff", "washup"],
      outreach_channel: [
        "linkedin_connect",
        "group_message",
        "old_attendee_list",
        "warm_intro",
        "cold_email",
      ],
      self_status: ["on_track", "needs_attention", "off_track"],
      session_format: ["keynote", "panel", "workshop", "fireside"],
      speaker_status: ["contacted", "responded", "confirmed", "declined"],
      website_stage: ["draft", "proof_1", "proof_2", "signed_off", "live"],
      website_task_type: [
        "proof_1",
        "proof_2",
        "final_signoff",
        "launch",
        "audit",
        "refresh",
      ],
    },
  },
} as const
