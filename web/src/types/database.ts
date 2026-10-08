/**
 * Supabase database types for the public schema (P05 AR-12).
 * Generated from the live schema (information_schema export, 2026-10-05) and the foreign
 * keys in supabase/schema.sql + migrations, in the format `supabase gen types` produces.
 * Regenerate after every migration that changes columns or functions:
 * `npx supabase gen types typescript --project-id <ref> --schema public` (needs the
 * Developer role or higher on the Supabase project), or update the affected table by hand.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      addresses: {
        Row: {
          id: string;
          customer_id: string;
          street: string;
          unit: string | null;
          city: string;
          state: string;
          zip: string;
          lat: number | null;
          lng: number | null;
          is_default: boolean;
          delivery_notes: string | null;
          zone_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          street: string;
          unit?: string | null;
          city?: string;
          state?: string;
          zip: string;
          lat?: number | null;
          lng?: number | null;
          is_default?: boolean;
          delivery_notes?: string | null;
          zone_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          street?: string;
          unit?: string | null;
          city?: string;
          state?: string;
          zip?: string;
          lat?: number | null;
          lng?: number | null;
          is_default?: boolean;
          delivery_notes?: string | null;
          zone_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'addresses_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'addresses_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_audit_logs: {
        Row: {
          id: string;
          admin_id: string | null;
          admin_email: string;
          action: string;
          target_type: string;
          target_id: string;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          admin_email: string;
          action: string;
          target_type: string;
          target_id: string;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          admin_email?: string;
          action?: string;
          target_type?: string;
          target_id?: string;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_audit_logs_admin_id_fkey';
            columns: ['admin_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      claims: {
        Row: {
          id: string;
          order_id: string;
          customer_id: string;
          issue_type: string;
          description: string;
          photo_urls: string[] | null;
          status: string;
          resolution_notes: string | null;
          created_at: string;
          updated_at: string;
          refund_amount: number | null;
          square_refund_id: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          customer_id: string;
          issue_type: string;
          description: string;
          photo_urls?: string[] | null;
          status?: string;
          resolution_notes?: string | null;
          created_at?: string;
          updated_at?: string;
          refund_amount?: number | null;
          square_refund_id?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          customer_id?: string;
          issue_type?: string;
          description?: string;
          photo_urls?: string[] | null;
          status?: string;
          resolution_notes?: string | null;
          created_at?: string;
          updated_at?: string;
          refund_amount?: number | null;
          square_refund_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'claims_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'claims_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      commercial_accounts: {
        Row: {
          id: string;
          business_name: string;
          contact_name: string;
          contact_email: string;
          contact_phone: string;
          billing_email: string | null;
          rate_card_id: string | null;
          payment_terms: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_name: string;
          contact_name: string;
          contact_email: string;
          contact_phone: string;
          billing_email?: string | null;
          rate_card_id?: string | null;
          payment_terms?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_name?: string;
          contact_name?: string;
          contact_email?: string;
          contact_phone?: string;
          billing_email?: string | null;
          rate_card_id?: string | null;
          payment_terms?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      customer_preferences: {
        Row: {
          customer_id: string;
          starch_level: string | null;
          fold_vs_hang: string | null;
          detergent_sensitivity: string | null;
          gate_code: string | null;
          delivery_instructions: string | null;
          special_notes: string | null;
          updated_at: string;
        };
        Insert: {
          customer_id: string;
          starch_level?: string | null;
          fold_vs_hang?: string | null;
          detergent_sensitivity?: string | null;
          gate_code?: string | null;
          delivery_instructions?: string | null;
          special_notes?: string | null;
          updated_at?: string;
        };
        Update: {
          customer_id?: string;
          starch_level?: string | null;
          fold_vs_hang?: string | null;
          detergent_sensitivity?: string | null;
          gate_code?: string | null;
          delivery_instructions?: string | null;
          special_notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_preferences_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: true;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          auth_id: string | null;
          email: string;
          phone: string | null;
          full_name: string;
          role: string;
          created_at: string;
          updated_at: string;
          sms_consent: boolean;
          sms_promotions_consent: boolean;
          sms_consent_at: string | null;
          square_customer_id: string | null;
          phone_verified_at: string | null;
        };
        Insert: {
          id?: string;
          auth_id?: string | null;
          email: string;
          phone?: string | null;
          full_name: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
          sms_consent?: boolean;
          sms_promotions_consent?: boolean;
          sms_consent_at?: string | null;
          square_customer_id?: string | null;
          phone_verified_at?: string | null;
        };
        Update: {
          id?: string;
          auth_id?: string | null;
          email?: string;
          phone?: string | null;
          full_name?: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
          sms_consent?: boolean;
          sms_promotions_consent?: boolean;
          sms_consent_at?: string | null;
          square_customer_id?: string | null;
          phone_verified_at?: string | null;
        };
        Relationships: [];
      };
      error_logs: {
        Row: {
          id: string;
          error_type: string;
          message: string;
          user_id: string | null;
          route: string | null;
          stack_trace: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          error_type: string;
          message: string;
          user_id?: string | null;
          route?: string | null;
          stack_trace?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          error_type?: string;
          message?: string;
          user_id?: string | null;
          route?: string | null;
          stack_trace?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      garment_photos: {
        Row: {
          id: string;
          order_id: string;
          order_item_id: string | null;
          photo_type: string;
          photo_url: string;
          condition_notes: string | null;
          captured_by: string | null;
          captured_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          order_item_id?: string | null;
          photo_type: string;
          photo_url: string;
          condition_notes?: string | null;
          captured_by?: string | null;
          captured_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          order_item_id?: string | null;
          photo_type?: string;
          photo_url?: string;
          condition_notes?: string | null;
          captured_by?: string | null;
          captured_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'garment_photos_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'garment_photos_order_item_id_fkey';
            columns: ['order_item_id'];
            isOneToOne: false;
            referencedRelation: 'order_items';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          customer_id: string;
          channel: string;
          direction: string;
          body: string;
          order_id: string | null;
          stage: string | null;
          media_url: string | null;
          mode: string | null;
          external_id: string | null;
          from_address: string | null;
          to_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          channel: string;
          direction: string;
          body?: string;
          order_id?: string | null;
          stage?: string | null;
          media_url?: string | null;
          mode?: string | null;
          external_id?: string | null;
          from_address?: string | null;
          to_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          channel?: string;
          direction?: string;
          body?: string;
          order_id?: string | null;
          stage?: string | null;
          media_url?: string | null;
          mode?: string | null;
          external_id?: string | null;
          from_address?: string | null;
          to_address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      order_events: {
        Row: {
          id: string;
          order_id: string;
          status: string;
          timestamp: string;
          note: string | null;
          triggered_by: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          status: string;
          timestamp?: string;
          note?: string | null;
          triggered_by?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          status?: string;
          timestamp?: string;
          note?: string | null;
          triggered_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'order_events_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          garment_type: string;
          service_type: string;
          quantity: number;
          unit_price: number;
          subtotal: number;
          notes: string | null;
          details: Json | null;
          quote_status: string;
          quoted_unit_price: number | null;
          quote_requested_at: string | null;
          quote_reminder_stage: number;
          quote_decided_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          garment_type: string;
          service_type?: string;
          quantity?: number;
          unit_price: number;
          subtotal: number;
          notes?: string | null;
          details?: Json | null;
          quote_status?: string;
          quoted_unit_price?: number | null;
          quote_requested_at?: string | null;
          quote_reminder_stage?: number;
          quote_decided_at?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          garment_type?: string;
          service_type?: string;
          quantity?: number;
          unit_price?: number;
          subtotal?: number;
          notes?: string | null;
          details?: Json | null;
          quote_status?: string;
          quoted_unit_price?: number | null;
          quote_requested_at?: string | null;
          quote_reminder_stage?: number;
          quote_decided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      distance_cache: {
        Row: {
          address_key: string;
          miles: number;
          created_at: string;
        };
        Insert: {
          address_key: string;
          miles: number;
          created_at?: string;
        };
        Update: {
          address_key?: string;
          miles?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      route_cycles: {
        Row: {
          run_date: string;
          band: string;
          status: string;
          dispatched_at: string | null;
          dispatched_by: string | null;
          notified_at: string | null;
          decided_at: string | null;
        };
        Insert: {
          run_date: string;
          band: string;
          status?: string;
          dispatched_at?: string | null;
          dispatched_by?: string | null;
          notified_at?: string | null;
          decided_at?: string | null;
        };
        Update: {
          run_date?: string;
          band?: string;
          status?: string;
          dispatched_at?: string | null;
          dispatched_by?: string | null;
          notified_at?: string | null;
          decided_at?: string | null;
        };
        Relationships: [];
      };
      routine_memberships: {
        Row: {
          id: string;
          customer_id: string;
          status: string;
          cadence: string;
          pickup_day: string;
          pickup_window: string;
          address_id: string | null;
          next_pickup_date: string | null;
          paused_until: string | null;
          consecutive_skips: number;
          template: Json;
          square_customer_id: string | null;
          square_card_id: string | null;
          terms_version: string;
          terms_accepted_at: string;
          enrolled_order_id: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          status?: string;
          cadence: string;
          pickup_day: string;
          pickup_window: string;
          address_id?: string | null;
          next_pickup_date?: string | null;
          paused_until?: string | null;
          consecutive_skips?: number;
          template?: Json;
          square_customer_id?: string | null;
          square_card_id?: string | null;
          terms_version: string;
          terms_accepted_at: string;
          enrolled_order_id?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          status?: string;
          cadence?: string;
          pickup_day?: string;
          pickup_window?: string;
          address_id?: string | null;
          next_pickup_date?: string | null;
          paused_until?: string | null;
          consecutive_skips?: number;
          template?: Json;
          square_customer_id?: string | null;
          square_card_id?: string | null;
          terms_version?: string;
          terms_accepted_at?: string;
          enrolled_order_id?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'routine_memberships_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'routine_memberships_address_id_fkey';
            columns: ['address_id'];
            isOneToOne: false;
            referencedRelation: 'addresses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'routine_memberships_enrolled_order_id_fkey';
            columns: ['enrolled_order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      sign_in_codes: {
        Row: {
          id: string;
          customer_id: string;
          purpose: string;
          code_hash: string;
          phone: string;
          attempts: number;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          purpose: string;
          code_hash: string;
          phone: string;
          attempts?: number;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          purpose?: string;
          code_hash?: string;
          phone?: string;
          attempts?: number;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sign_in_codes_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      waitlist: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          street: string | null;
          city: string | null;
          zip: string;
          miles: number | null;
          source: string;
          reason: string;
          sms_consent: boolean;
          notified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          street?: string | null;
          city?: string | null;
          zip: string;
          miles?: number | null;
          source?: string;
          reason?: string;
          sms_consent?: boolean;
          notified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          street?: string | null;
          city?: string | null;
          zip?: string;
          miles?: number | null;
          source?: string;
          reason?: string;
          sms_consent?: boolean;
          notified_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      zone_resolution_log: {
        Row: {
          zip: string;
          miles: number | null;
          zone_id: string;
          band: string | null;
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          zip: string;
          miles?: number | null;
          zone_id: string;
          band?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: {
          zip?: string;
          miles?: number | null;
          zone_id?: string;
          band?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Relationships: [];
      };
      order_payments: {
        Row: {
          id: string;
          order_id: string;
          square_payment_id: string | null;
          kind: string;
          amount: number;
          status: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          square_payment_id?: string | null;
          kind: string;
          amount: number;
          status: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          square_payment_id?: string | null;
          kind?: string;
          amount?: number;
          status?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string;
          address_id: string | null;
          status: string;
          order_type: string;
          pickup_date: string;
          pickup_window: string;
          delivery_date: string | null;
          delivery_window: string | null;
          weight_lbs: number | null;
          subtotal: number;
          express_tier: string;
          promo_code: string | null;
          discount_amount: number;
          total: number;
          payment_id: string | null;
          payment_status: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
          express_surcharge: number;
          express_auto_refunded: boolean;
          express_refund_amount: number | null;
          express_refund_reason: string | null;
          square_customer_id: string | null;
          square_card_id: string | null;
          refunded_amount: number;
          assigned_driver_id: string | null;
          environmental_fee: number | null;
          sales_tax: number | null;
          idempotency_key: string | null;
          hold_payment_id: string | null;
          hold_amount: number | null;
          hold_expires_at: string | null;
          hold_status: string;
          amount_due: number;
          payment_terms_accepted_at: string | null;
          payment_terms_version: string | null;
          payment_needed_since: string | null;
          payment_reminder_stage: number;
          zone_id: string | null;
          distance_miles: number | null;
          extended_reach_band: string | null;
          extended_reach_fee: number;
          frequency: string;
          routine_membership_id: string | null;
        };
        Insert: {
          id?: string;
          order_number: string;
          customer_id: string;
          address_id?: string | null;
          status?: string;
          order_type?: string;
          pickup_date: string;
          pickup_window: string;
          delivery_date?: string | null;
          delivery_window?: string | null;
          weight_lbs?: number | null;
          subtotal?: number;
          express_tier?: string;
          promo_code?: string | null;
          discount_amount?: number;
          total?: number;
          payment_id?: string | null;
          payment_status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          express_surcharge?: number;
          express_auto_refunded?: boolean;
          express_refund_amount?: number | null;
          express_refund_reason?: string | null;
          square_customer_id?: string | null;
          square_card_id?: string | null;
          refunded_amount?: number;
          assigned_driver_id?: string | null;
          environmental_fee?: number | null;
          sales_tax?: number | null;
          idempotency_key?: string | null;
          hold_payment_id?: string | null;
          hold_amount?: number | null;
          hold_expires_at?: string | null;
          hold_status?: string;
          amount_due?: number;
          payment_terms_accepted_at?: string | null;
          payment_terms_version?: string | null;
          payment_needed_since?: string | null;
          payment_reminder_stage?: number;
          zone_id?: string | null;
          distance_miles?: number | null;
          extended_reach_band?: string | null;
          extended_reach_fee?: number;
          frequency?: string;
          routine_membership_id?: string | null;
        };
        Update: {
          id?: string;
          order_number?: string;
          customer_id?: string;
          address_id?: string | null;
          status?: string;
          order_type?: string;
          pickup_date?: string;
          pickup_window?: string;
          delivery_date?: string | null;
          delivery_window?: string | null;
          weight_lbs?: number | null;
          subtotal?: number;
          express_tier?: string;
          promo_code?: string | null;
          discount_amount?: number;
          total?: number;
          payment_id?: string | null;
          payment_status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          express_surcharge?: number;
          express_auto_refunded?: boolean;
          express_refund_amount?: number | null;
          express_refund_reason?: string | null;
          square_customer_id?: string | null;
          square_card_id?: string | null;
          refunded_amount?: number;
          assigned_driver_id?: string | null;
          environmental_fee?: number | null;
          sales_tax?: number | null;
          idempotency_key?: string | null;
          hold_payment_id?: string | null;
          hold_amount?: number | null;
          hold_expires_at?: string | null;
          hold_status?: string;
          amount_due?: number;
          payment_terms_accepted_at?: string | null;
          payment_terms_version?: string | null;
          payment_needed_since?: string | null;
          payment_reminder_stage?: number;
          zone_id?: string | null;
          distance_miles?: number | null;
          extended_reach_band?: string | null;
          extended_reach_fee?: number;
          frequency?: string;
          routine_membership_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_address_id_fkey';
            columns: ['address_id'];
            isOneToOne: false;
            referencedRelation: 'addresses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_assigned_driver_id_fkey';
            columns: ['assigned_driver_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_routine_membership_id_fkey';
            columns: ['routine_membership_id'];
            isOneToOne: false;
            referencedRelation: 'routine_memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      promo_codes: {
        Row: {
          id: string;
          code: string;
          discount_type: string;
          discount_value: number;
          max_uses: number | null;
          current_uses: number;
          valid_from: string;
          valid_until: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          discount_type?: string;
          discount_value: number;
          max_uses?: number | null;
          current_uses?: number;
          valid_from?: string;
          valid_until?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          code?: string;
          discount_type?: string;
          discount_value?: number;
          max_uses?: number | null;
          current_uses?: number;
          valid_from?: string;
          valid_until?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      staff: {
        Row: {
          id: string;
          name: string;
          role: string;
          email: string;
          phone: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          role: string;
          email: string;
          phone?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          role?: string;
          email?: string;
          phone?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      time_slots: {
        Row: {
          id: string;
          date: string;
          window: string;
          capacity: number;
          booked_count: number;
          is_available: boolean;
          zone_id: string | null;
        };
        Insert: {
          id?: string;
          date: string;
          window: string;
          capacity?: number;
          booked_count?: number;
          is_available?: boolean;
          zone_id?: string | null;
        };
        Update: {
          id?: string;
          date?: string;
          window?: string;
          capacity?: number;
          booked_count?: number;
          is_available?: boolean;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'time_slots_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
        ];
      };
      zones: {
        Row: {
          id: string;
          name: string;
          service_days: string[];
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          service_days?: string[];
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          service_days?: string[];
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      anonymize_customer: { Args: { p_customer_id: string; p_request_id?: string | null }; Returns: Json };
      create_booking: { Args: { p: Json }; Returns: Json };
      export_customer_data: { Args: { p_customer_id: string }; Returns: Json };
      mission_control_summary: { Args: { p_today: string }; Returns: Json };
      normalize_phone_e164: { Args: { raw: string }; Returns: string };
      order_financial_summary: { Args: { p_from: string; p_to: string }; Returns: Json };
      reserve_promo_use: { Args: { p_code: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
