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
      agenda_items: {
        Row: {
          av_requirements: string | null
          created_at: string
          description: string | null
          duration_min: number
          event_id: string
          id: string
          position: number
          session_type: string
          speaker_extra: string | null
          speaker_ids: string[]
          start_time: string | null
          title: string | null
          track: string | null
          updated_at: string
        }
        Insert: {
          av_requirements?: string | null
          created_at?: string
          description?: string | null
          duration_min?: number
          event_id: string
          id?: string
          position?: number
          session_type?: string
          speaker_extra?: string | null
          speaker_ids?: string[]
          start_time?: string | null
          title?: string | null
          track?: string | null
          updated_at?: string
        }
        Update: {
          av_requirements?: string | null
          created_at?: string
          description?: string | null
          duration_min?: number
          event_id?: string
          id?: string
          position?: number
          session_type?: string
          speaker_extra?: string | null
          speaker_ids?: string[]
          start_time?: string | null
          title?: string | null
          track?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_templates: {
        Row: {
          created_at: string
          id: string
          minutes: number
          position: number
          session_type: string
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          minutes: number
          position?: number
          session_type: string
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          minutes?: number
          position?: number
          session_type?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_recipients: {
        Row: {
          created_at: string
          email_send_id: string
          id: string
          recipient_email: string | null
          recipient_name: string | null
          speaker_id: string | null
        }
        Insert: {
          created_at?: string
          email_send_id: string
          id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          speaker_id?: string | null
        }
        Update: {
          created_at?: string
          email_send_id?: string
          id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          speaker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_send_recipients_email_send_id_fkey"
            columns: ["email_send_id"]
            isOneToOne: false
            referencedRelation: "email_sends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_recipients_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          body: string
          created_at: string
          event_id: string | null
          id: string
          recipient_count: number
          sent_at: string
          sent_by: string
          subject: string
          template_type: string
        }
        Insert: {
          body: string
          created_at?: string
          event_id?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string
          sent_by?: string
          subject: string
          template_type: string
        }
        Update: {
          body?: string
          created_at?: string
          event_id?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string
          sent_by?: string
          subject?: string
          template_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_archived: boolean
          is_seed: boolean
          name: string
          slug: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_archived?: boolean
          is_seed?: boolean
          name: string
          slug: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          is_seed?: boolean
          name?: string
          slug?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      event_outreach: {
        Row: {
          colleague_linkedin: string | null
          colleague_slack: string | null
          connect_message: string | null
          created_at: string
          event_id: string
          id: string
          inmail_message: string | null
          inmail_subject: string | null
          updated_at: string
        }
        Insert: {
          colleague_linkedin?: string | null
          colleague_slack?: string | null
          connect_message?: string | null
          created_at?: string
          event_id: string
          id?: string
          inmail_message?: string | null
          inmail_subject?: string | null
          updated_at?: string
        }
        Update: {
          colleague_linkedin?: string | null
          colleague_slack?: string | null
          connect_message?: string | null
          created_at?: string
          event_id?: string
          id?: string
          inmail_message?: string | null
          inmail_subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_outreach_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_saved_searches: {
        Row: {
          created_at: string
          event_id: string
          id: string
          label: string
          position: number
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          label: string
          position?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          label?: string
          position?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_saved_searches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          asana_project_gid: string | null
          banner_dropbox_link: string | null
          business_line: Database["public"]["Enums"]["business_line"]
          code: string
          created_at: string
          event_date: string | null
          external_agenda_url: string | null
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
          speaker_target: number
          tito_slug: string | null
          updated_at: string
          venue: string | null
          washup_date: string | null
          website_status: Database["public"]["Enums"]["website_stage"]
        }
        Insert: {
          asana_project_gid?: string | null
          banner_dropbox_link?: string | null
          business_line: Database["public"]["Enums"]["business_line"]
          code: string
          created_at?: string
          event_date?: string | null
          external_agenda_url?: string | null
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
          speaker_target?: number
          tito_slug?: string | null
          updated_at?: string
          venue?: string | null
          washup_date?: string | null
          website_status?: Database["public"]["Enums"]["website_stage"]
        }
        Update: {
          asana_project_gid?: string | null
          banner_dropbox_link?: string | null
          business_line?: Database["public"]["Enums"]["business_line"]
          code?: string
          created_at?: string
          event_date?: string | null
          external_agenda_url?: string | null
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
          speaker_target?: number
          tito_slug?: string | null
          updated_at?: string
          venue?: string | null
          washup_date?: string | null
          website_status?: Database["public"]["Enums"]["website_stage"]
        }
        Relationships: []
      }
      excluded_companies: {
        Row: {
          company_name: string
          created_at: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          company_name: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
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
      speaker_activity_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          note: string | null
          speaker_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          speaker_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          speaker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaker_activity_log_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      speakers: {
        Row: {
          banner_status: Database["public"]["Enums"]["banner_status"]
          bio_and_headshot_received: boolean
          bio_received: boolean
          bio_text: string | null
          call_scheduled: boolean
          call_scheduled_at: string | null
          company: string | null
          copied_from_speaker_id: string | null
          created_at: string
          dropbox_link: string | null
          email: string | null
          event_id: string
          gmail_thread_id: string | null
          headshot_received: boolean
          id: string
          last_message_at: string | null
          last_message_direction: string | null
          last_message_unread: boolean
          linkedin_post_confirmed: boolean
          linkedin_url: string | null
          name: string
          notes: string | null
          outreach_channel:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          session_format: Database["public"]["Enums"]["session_format"] | null
          session_title: string | null
          source: string | null
          source_ticket_id: string | null
          status: Database["public"]["Enums"]["speaker_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          banner_status?: Database["public"]["Enums"]["banner_status"]
          bio_and_headshot_received?: boolean
          bio_received?: boolean
          bio_text?: string | null
          call_scheduled?: boolean
          call_scheduled_at?: string | null
          company?: string | null
          copied_from_speaker_id?: string | null
          created_at?: string
          dropbox_link?: string | null
          email?: string | null
          event_id: string
          gmail_thread_id?: string | null
          headshot_received?: boolean
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_unread?: boolean
          linkedin_post_confirmed?: boolean
          linkedin_url?: string | null
          name: string
          notes?: string | null
          outreach_channel?:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          session_format?: Database["public"]["Enums"]["session_format"] | null
          session_title?: string | null
          source?: string | null
          source_ticket_id?: string | null
          status?: Database["public"]["Enums"]["speaker_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          banner_status?: Database["public"]["Enums"]["banner_status"]
          bio_and_headshot_received?: boolean
          bio_received?: boolean
          bio_text?: string | null
          call_scheduled?: boolean
          call_scheduled_at?: string | null
          company?: string | null
          copied_from_speaker_id?: string | null
          created_at?: string
          dropbox_link?: string | null
          email?: string | null
          event_id?: string
          gmail_thread_id?: string | null
          headshot_received?: boolean
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_unread?: boolean
          linkedin_post_confirmed?: boolean
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          outreach_channel?:
            | Database["public"]["Enums"]["outreach_channel"]
            | null
          session_format?: Database["public"]["Enums"]["session_format"] | null
          session_title?: string | null
          source?: string | null
          source_ticket_id?: string | null
          status?: Database["public"]["Enums"]["speaker_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "speakers_copied_from_speaker_id_fkey"
            columns: ["copied_from_speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speakers_source_ticket_id_fkey"
            columns: ["source_ticket_id"]
            isOneToOne: false
            referencedRelation: "tito_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_mentions: {
        Row: {
          actioned: boolean
          created_at: string
          event_id: string | null
          gmail_thread_id: string
          id: string
          message_date: string | null
          sender_email: string | null
          snippet: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          actioned?: boolean
          created_at?: string
          event_id?: string | null
          gmail_thread_id: string
          id?: string
          message_date?: string | null
          sender_email?: string | null
          snippet?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          actioned?: boolean
          created_at?: string
          event_id?: string | null
          gmail_thread_id?: string
          id?: string
          message_date?: string | null
          sender_email?: string | null
          snippet?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_mentions_event_id_fkey"
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
      tito_answers: {
        Row: {
          created_at: string
          id: string
          question_id: string | null
          question_title: string | null
          response: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id?: string | null
          question_title?: string | null
          response?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string | null
          question_title?: string | null
          response?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tito_answers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tito_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tito_event_filters: {
        Row: {
          created_at: string
          event_slug: string
          id: string
          mode: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          event_slug: string
          id?: string
          mode: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          event_slug?: string
          id?: string
          mode?: string
          notes?: string | null
        }
        Relationships: []
      }
      tito_events: {
        Row: {
          business_line: string
          created_at: string
          end_date: string | null
          id: string
          is_past: boolean
          last_synced_at: string | null
          slug: string
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          business_line?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_past?: boolean
          last_synced_at?: string | null
          slug: string
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          business_line?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_past?: boolean
          last_synced_at?: string | null
          slug?: string
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      tito_releases: {
        Row: {
          created_at: string
          event_slug: string
          id: string
          quantity: number | null
          raw: Json | null
          registration_url: string | null
          slug: string | null
          state: string | null
          tickets_count: number | null
          title: string
          tito_release_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_slug: string
          id?: string
          quantity?: number | null
          raw?: Json | null
          registration_url?: string | null
          slug?: string | null
          state?: string | null
          tickets_count?: number | null
          title: string
          tito_release_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_slug?: string
          id?: string
          quantity?: number | null
          raw?: Json | null
          registration_url?: string | null
          slug?: string | null
          state?: string | null
          tickets_count?: number | null
          title?: string
          tito_release_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tito_tickets: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          event_slug: string
          event_title: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          location: string | null
          name: string | null
          raw: Json | null
          registration_id: string | null
          release_id: string | null
          release_slug: string | null
          release_title: string | null
          state: string | null
          tito_ticket_id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          event_slug: string
          event_title?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          location?: string | null
          name?: string | null
          raw?: Json | null
          registration_id?: string | null
          release_id?: string | null
          release_slug?: string | null
          release_title?: string | null
          state?: string | null
          tito_ticket_id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          event_slug?: string
          event_title?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          location?: string | null
          name?: string | null
          raw?: Json | null
          registration_id?: string | null
          release_id?: string | null
          release_slug?: string | null
          release_title?: string | null
          state?: string | null
          tito_ticket_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      website_tasks: {
        Row: {
          amendments_actioned_date: string | null
          amendments_actioned_done: boolean
          buddy_proof_date: string | null
          buddy_proof_done: boolean
          created_at: string
          due_date: string | null
          event_id: string
          final_signoff_date: string | null
          final_signoff_done: boolean
          id: string
          marketer_proof_date: string | null
          marketer_proof_done: boolean
          markup_url: string | null
          protected: boolean
          status: Database["public"]["Enums"]["website_stage"]
          task_type: Database["public"]["Enums"]["website_task_type"] | null
          title: string | null
          updated_at: string
        }
        Insert: {
          amendments_actioned_date?: string | null
          amendments_actioned_done?: boolean
          buddy_proof_date?: string | null
          buddy_proof_done?: boolean
          created_at?: string
          due_date?: string | null
          event_id: string
          final_signoff_date?: string | null
          final_signoff_done?: boolean
          id?: string
          marketer_proof_date?: string | null
          marketer_proof_done?: boolean
          markup_url?: string | null
          protected?: boolean
          status?: Database["public"]["Enums"]["website_stage"]
          task_type?: Database["public"]["Enums"]["website_task_type"] | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          amendments_actioned_date?: string | null
          amendments_actioned_done?: boolean
          buddy_proof_date?: string | null
          buddy_proof_done?: boolean
          created_at?: string
          due_date?: string | null
          event_id?: string
          final_signoff_date?: string | null
          final_signoff_done?: boolean
          id?: string
          marketer_proof_date?: string | null
          marketer_proof_done?: boolean
          markup_url?: string | null
          protected?: boolean
          status?: Database["public"]["Enums"]["website_stage"]
          task_type?: Database["public"]["Enums"]["website_task_type"] | null
          title?: string | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "staff" | "admin"
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
      speaker_status:
        | "new"
        | "contacted"
        | "responded"
        | "confirmed"
        | "declined"
      website_stage:
        | "draft"
        | "proof_1"
        | "proof_2"
        | "amendments"
        | "signed_off"
        | "live"
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
      app_role: ["staff", "admin"],
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
      speaker_status: [
        "new",
        "contacted",
        "responded",
        "confirmed",
        "declined",
      ],
      website_stage: [
        "draft",
        "proof_1",
        "proof_2",
        "amendments",
        "signed_off",
        "live",
      ],
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
