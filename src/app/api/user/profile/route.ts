import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateProfileSchema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    birthDate: z.string().optional(),
    gender: z.enum(['M', 'F', 'PREFER_NOT_SAY']).optional(),
    cityPreference: z.string().optional(), // User A
    profession: z.string().optional(), // User B
    availability: z.any().optional(), // User B
});

export async function PUT(request: Request) {
    try {
        // Get Authorization header
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user from token
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = updateProfileSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues }, { status: 400 });
        }

        const { firstName, lastName, birthDate, gender, cityPreference, profession, availability } = validation.data;

        // Update Profile
        const profileUpdates: any = {};
        if (firstName) profileUpdates.first_name = firstName;
        if (lastName) profileUpdates.last_name = lastName;
        if (birthDate) profileUpdates.birth_date = birthDate;
        if (gender) profileUpdates.gender = gender;

        if (Object.keys(profileUpdates).length > 0) {
            const { error } = await supabaseAdmin
                .from('profiles')
                .update(profileUpdates)
                .eq('id', user.id);

            if (error) {
                return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
            }
        }

        // Update Role Details
        // Let's fetch role.
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();

        if (profile?.role === 'user_reconversion') {
            if (cityPreference) {
                const { error } = await supabaseAdmin
                    .from('user_a_details')
                    .update({ city_preference: cityPreference })
                    .eq('user_id', user.id);
                if (error) return NextResponse.json({ error: 'Failed to update user details' }, { status: 500 });
            }
        } else if (profile?.role === 'user_pro') {
            const updates: any = {};
            if (profession) updates.profession = profession;
            if (availability) updates.availability = availability;

            if (Object.keys(updates).length > 0) {
                const { error } = await supabaseAdmin
                    .from('user_b_details')
                    .update(updates)
                    .eq('user_id', user.id);
                if (error) return NextResponse.json({ error: 'Failed to update user details' }, { status: 500 });
            }
        }

        return NextResponse.json({ message: 'Profile updated successfully' }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
