-- ============================================
-- QC Financial ETL Connector - Supabase Schema
-- ============================================
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. PROFILES TABLE
-- Stores user profiles with tier information
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tier TEXT DEFAULT 'free' CHECK (tier IN ('guest', 'free', 'pro')),
    ls_subscription_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, tier)
    VALUES (NEW.id, 'free');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. CONVERSIONS TABLE
-- Logs each document conversion for analytics
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    document_hash TEXT,
    total_rows INTEGER, -- Count of eligible transactions
    metadata_rows INTEGER, -- Count of summary/metadata rows
    processing_time_ms NUMERIC,
    dq_clean INTEGER DEFAULT 0, -- CLEAN flag
    dq_recovered INTEGER DEFAULT 0, -- RECOVERED_TRANSACTION flag
    dq_suspect INTEGER DEFAULT 0, -- SUSPECT flag
    dq_non_transaction INTEGER DEFAULT 0, -- NON_TRANSACTION flag
    tool_type TEXT DEFAULT 'bank_statement',
    country TEXT DEFAULT 'Unknown',
    city TEXT DEFAULT 'Unknown',
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;

-- Users can read their own conversions
DROP POLICY IF EXISTS "Users can read own conversions" ON public.conversions;
CREATE POLICY "Users can read own conversions" ON public.conversions
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert (for backend)
DROP POLICY IF EXISTS "Service role can insert conversions" ON public.conversions;
CREATE POLICY "Service role can insert conversions" ON public.conversions
    FOR INSERT WITH CHECK (true);


-- 3. EVENTS TABLE
-- UI event tracking for analytics
-- ============================================
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    element TEXT,
    country TEXT DEFAULT 'Unknown',
    city TEXT DEFAULT 'Unknown',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Service role can insert
DROP POLICY IF EXISTS "Service role can insert events" ON public.events;
CREATE POLICY "Service role can insert events" ON public.events
    FOR INSERT WITH CHECK (true);


-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_conversions_user_id ON public.conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversions_created_at ON public.conversions(created_at);
CREATE INDEX IF NOT EXISTS idx_conversions_ip ON public.conversions(ip_address);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events(user_id);


-- ============================================
-- GRANT SERVICE ROLE ACCESS
-- (Required for backend to bypass RLS)
-- ============================================
-- The service_role key automatically bypasses RLS,
-- but you need to ensure your SUPABASE_SERVICE_ROLE_KEY
-- environment variable is set in your backend.

-- ============================================
-- SUMMARY
-- ============================================
-- Tables created:
--   1. profiles     - User profiles with tier (guest/free/pro)
--   2. conversions  - Conversion logs with DQ stats
--   3. events       - UI event tracking
--
-- Environment variables needed:
--   SUPABASE_URL          - Your project URL
--   SUPABASE_KEY          - anon/public key
--   SUPABASE_SERVICE_ROLE_KEY - service_role key (for backend)
