# Manual SQL Schema Application - Rescheduling

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
-- Add columns for rescheduling negotiation
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS proposed_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS proposed_by UUID REFERENCES profiles(id);
```

---

## What This Does:

1. ✅ Adds `proposed_date` column to store the suggested new time
2. ✅ Adds `proposed_by` column to track who made the suggestion

---

**Status:** Ready to apply | **File also available at:** `server/src/scripts/add_rescheduling.sql`
