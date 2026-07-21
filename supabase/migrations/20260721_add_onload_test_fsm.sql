-- supabase/migrations/20260721_add_onload_test_fsm.sql

-- Drop existing check constraint on facility_states fsm_mode
ALTER TABLE public.facility_states DROP CONSTRAINT IF EXISTS facility_states_fsm_mode_check;

-- Add updated check constraint including ON_LOAD_TEST
ALTER TABLE public.facility_states ADD CONSTRAINT facility_states_fsm_mode_check CHECK (fsm_mode = ANY (ARRAY['NORMAL'::text, 'DAILY_TEST'::text, 'OUTAGE'::text, 'ON_LOAD_TEST'::text]));
