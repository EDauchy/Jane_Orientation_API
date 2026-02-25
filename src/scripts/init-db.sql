-- ============================================
-- SCRIPT D'INITIALISATION DE LA BASE DE DONNÉES
-- ============================================
-- Exécutez ce script dans l'éditeur SQL de Supabase
-- Ce script crée toutes les tables nécessaires au projet

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- Table: api_keys
-- ============================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT UNIQUE NOT NULL,
  api_key TEXT NOT NULL,
  base_url TEXT,
  model_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: roles
-- ============================================
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

-- Insert default roles
INSERT INTO public.roles (name) VALUES
  ('user_reconversion'),
  ('user_pro'),
  ('admin')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- Table: profiles
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL,
  birth_date DATE,
  gender TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: user_a_details
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_a_details (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  city_preference TEXT,
  test_results JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: user_b_details
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_b_details (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  profession TEXT,
  experience_verified BOOLEAN DEFAULT FALSE,
  bio TEXT,
  availability JSONB,
  years_experience INTEGER CHECK (years_experience IS NULL OR years_experience >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: appointments
-- ============================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED')),
  meeting_link TEXT,
  proposed_date TIMESTAMPTZ,
  proposed_by UUID REFERENCES public.profiles(id),
  cancelled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: reviews
-- ============================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: favorites
-- ============================================
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_a_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_b_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Profiles: Public read, users can update own profile
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- User A details: Users can view/update their own
CREATE POLICY "User A details viewable by owner" ON public.user_a_details
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "User A details updateable by owner" ON public.user_a_details
  FOR UPDATE USING (auth.uid() = user_id);

-- User B details: Public read (for finding professionals), owners can update
CREATE POLICY "User B details viewable by everyone" ON public.user_b_details
  FOR SELECT USING (true);

CREATE POLICY "User B details updateable by owner" ON public.user_b_details
  FOR UPDATE USING (auth.uid() = user_id);

-- Appointments: Users can see their own appointments
CREATE POLICY "Users can see own appointments" ON public.appointments
  FOR SELECT USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "User A can create appointments" ON public.appointments
  FOR INSERT WITH CHECK (auth.uid() = user_a_id);

CREATE POLICY "Users can update own appointments" ON public.appointments
  FOR UPDATE USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Reviews: User A can create reviews for their appointments
CREATE POLICY "User A can create reviews" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = user_a_id);

CREATE POLICY "Users can view reviews" ON public.reviews
  FOR SELECT USING (true);

-- Favorites: Users can manage their own favorites
CREATE POLICY "Users can manage own favorites" ON public.favorites
  FOR ALL USING (auth.uid() = user_id);

-- API Keys: Only admins can manage
CREATE POLICY "Only admins can manage API keys" ON public.api_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- Table: job_keywords
-- ============================================
-- Table pour stocker les correspondances entre métiers et mots-clés
-- Permet de réduire les appels à l'API LLM en utilisant un cache
CREATE TABLE IF NOT EXISTS public.job_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL, -- Nom du métier (ex: "Développeur Front-End")
  keywords TEXT[] NOT NULL, -- Tableau de mots-clés associés au métier
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_name)
);

-- Index pour recherche rapide par métier
CREATE INDEX IF NOT EXISTS idx_job_keywords_job_name ON public.job_keywords(job_name);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_api_keys_service_name ON public.api_keys(service_name);
CREATE INDEX IF NOT EXISTS idx_appointments_user_a_id ON public.appointments(user_a_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user_b_id ON public.appointments(user_b_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_reviews_appointment_id ON public.reviews(appointment_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
