-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table: api_keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT UNIQUE NOT NULL, -- 'openai', 'openrouteservice', 'navitia'
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: profiles (extends auth.users)
-- Note: We assume auth.users exists in Supabase.
-- If running locally without Supabase Auth, we might need to mock it, but for now we assume standard Supabase setup.
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('USER_A', 'USER_B', 'ADMIN')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date DATE,
  gender TEXT, -- 'M', 'F', 'PREFER_NOT_SAY'
  photo_data BYTEA, -- Optimized image
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: user_a_details
CREATE TABLE IF NOT EXISTS user_a_details (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  city_preference TEXT,
  test_results JSONB -- Stores job suggestions
);

-- Table: user_b_details
CREATE TABLE IF NOT EXISTS user_b_details (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  profession TEXT NOT NULL,
  experience_verified BOOLEAN DEFAULT FALSE,
  availability JSONB -- Simplified availability
);

-- Table: appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID REFERENCES profiles(id),
  user_b_id UUID REFERENCES profiles(id),
  date TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED')),
  meet_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: favorites
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  resource_type TEXT CHECK (resource_type IN ('TRAINING', 'HOUSING')),
  resource_external_id TEXT,
  resource_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies (Basic setup - can be refined)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_a_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_b_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own profile. Public read might be needed for User B.
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Appointments: Users can see their own appointments
CREATE POLICY "Users can see own appointments" ON appointments FOR SELECT USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);
CREATE POLICY "User A can create appointments" ON appointments FOR INSERT WITH CHECK (auth.uid() = user_a_id);
CREATE POLICY "Users can update own appointments" ON appointments FOR UPDATE USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Favorites: Users can manage their own favorites
CREATE POLICY "Users can manage own favorites" ON favorites FOR ALL USING (auth.uid() = user_id);
