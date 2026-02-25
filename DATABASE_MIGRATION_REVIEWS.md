# Manual SQL Schema Application

## Instructions

Please apply the following SQL schema via **Supabase Dashboard → SQL Editor**:

### Step-by-Step:

1. Go to your Supabase project dashboard
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the entire SQL below
5. Click **Run** to execute

---

## SQL Schema to Apply:

```sql
-- Add stats columns to user_b_details
ALTER TABLE user_b_details
ADD COLUMN IF NOT EXISTS total_coachings INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS declined_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_b_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(appointment_id) -- One review per appointment
);

-- Enable RLS on reviews
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reviews
-- User A can create and view their own reviews
CREATE POLICY "User A can create reviews"
    ON reviews FOR INSERT
    WITH CHECK (auth.uid() = user_a_id);

CREATE POLICY "User A can view their own reviews"
    ON reviews FOR SELECT
    USING (auth.uid() = user_a_id);

-- User B can view reviews about them
CREATE POLICY "User B can view reviews about them"
    ON reviews FOR SELECT
    USING (auth.uid() = user_b_id);

-- Function to update user_b stats when a review is created
CREATE OR REPLACE FUNCTION update_user_b_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update total_reviews and average_rating
    UPDATE user_b_details
    SET
        total_reviews = (SELECT COUNT(*) FROM reviews WHERE user_b_id = NEW.user_b_id),
        average_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE user_b_id = NEW.user_b_id)
    WHERE user_id = NEW.user_b_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update stats on review insert
DROP TRIGGER IF EXISTS update_stats_on_review ON reviews;
CREATE TRIGGER update_stats_on_review
    AFTER INSERT ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_user_b_stats();

-- Function to update coaching count when appointment is confirmed and completed
CREATE OR REPLACE FUNCTION update_coaching_count()
RETURNS TRIGGER AS $$
BEGIN
    -- If appointment status changed to CONFIRMED and date is in the past
    IF NEW.status = 'CONFIRMED' AND NEW.date < NOW() AND (OLD.status != 'CONFIRMED' OR OLD.date >= NOW()) THEN
        UPDATE user_b_details
        SET total_coachings = total_coachings + 1
        WHERE user_id = NEW.user_b_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update coaching count
DROP TRIGGER IF EXISTS update_coaching_on_appointment ON appointments;
CREATE TRIGGER update_coaching_on_appointment
    AFTER UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_coaching_count();

-- Function to update declined count
CREATE OR REPLACE FUNCTION update_declined_count()
RETURNS TRIGGER AS $$
BEGIN
    -- If appointment status changed to CANCELLED by User B
    IF NEW.status = 'CANCELLED' AND OLD.status = 'PENDING' THEN
        UPDATE user_b_details
        SET declined_count = declined_count + 1
        WHERE user_id = NEW.user_b_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update declined count
DROP TRIGGER IF EXISTS update_declined_on_cancel ON appointments;
CREATE TRIGGER update_declined_on_cancel
    AFTER UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_declined_count();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reviews_user_b ON reviews(user_b_id);
CREATE INDEX IF NOT EXISTS idx_reviews_appointment ON reviews(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
```

---

## What This Does:

1. ✅ Adds stats columns to `user_b_details` table
2. ✅ Creates `reviews` table with proper constraints
3. ✅ Sets up RLS policies for secure access
4. ✅ Creates triggers to automatically update stats when:
   - A review is created → updates `average_rating` and `total_reviews`
   - An appointment is confirmed and date passes → increments `total_coachings`
   - An appointment is cancelled by User B → increments `declined_count`
5. ✅ Creates indexes for better performance

---

## After Running:

The review system will be fully functional:
- ✅ User A can rate professionals after confirmed appointments
- ✅ Stats automatically update in real-time
- ✅ Professional dashboard shows accurate data
- ✅ All data is properly secured with RLS

---

**Status:** Ready to apply | **File also available at:** `server/src/scripts/add_reviews_schema.sql`
