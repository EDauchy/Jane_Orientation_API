import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateProfileSchema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    birthDate: z.string().optional(),
    gender: z.enum(['M', 'F', 'PREFER_NOT_SAY']).optional(),
    cityPreference: z.string().optional(),
    bio: z.string().max(500).optional(),
    avatarUrl: z.string().url().optional(),
    yearsExperience: z.number().int().min(0).optional(),
});

export async function PUT(request: Request) {
    try {
        // Get Authorization header
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify token and get user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = updateProfileSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues }, { status: 400 });
        }

        const { firstName, lastName, birthDate, gender, cityPreference, bio, yearsExperience, avatarUrl } = validation.data;

        // Update profiles table
        const updateData: any = {};
        if (firstName) updateData.first_name = firstName;
        if (lastName) updateData.last_name = lastName;
        if (birthDate) updateData.birth_date = birthDate;
        if (gender) updateData.gender = gender;
        if (avatarUrl) updateData.avatar_url = avatarUrl;
        updateData.updated_at = new Date().toISOString();

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update(updateData)
            .eq('id', user.id);

        if (profileError) {
            console.error('Profile update error:', profileError);
            return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
        }

        // Update user_a_details if cityPreference is provided
        if (cityPreference !== undefined) {
            const { error: detailsError } = await supabaseAdmin
                .from('user_a_details')
                .update({ city_preference: cityPreference })
                .eq('user_id', user.id);

            if (detailsError) {
                console.error('Details update error:', detailsError);
            }
        }

        // Update user_b_details if bio or yearsExperience is provided
        if (bio !== undefined || yearsExperience !== undefined) {
            const userBUpdates: any = {};
            if (bio !== undefined) userBUpdates.bio = bio;
            if (yearsExperience !== undefined) userBUpdates.years_experience = yearsExperience;

            const { error: userBError } = await supabaseAdmin
                .from('user_b_details')
                .update(userBUpdates)
                .eq('user_id', user.id);

            if (userBError) {
                console.error('User B details update error:', userBError);
            }
        }

        return NextResponse.json({ message: 'Profile updated successfully' }, { status: 200 });

    } catch (error: any) {
        console.error('Update profile error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
