import { createClient, supabaseAdmin } from '@/lib/supabase';
import { DEFAULT_AVATAR_URL } from '@/settings';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Validation Schemas
const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(['user_reconversion', 'user_pro']), // Updated roles
    birthDate: z.string().optional(), // ISO Date string
    gender: z.enum(['M', 'F', 'PREFER_NOT_SAY']).optional(),
    cityPreference: z.string().optional(), // User A only
    profession: z.string().optional(), // User B only
    experienceVerified: z.boolean().optional(), // User B only
    availability: z.any().optional(), // User B only - JSON object for weekly schedule
    bio: z.string().optional(), // User B only
    yearsExperience: z.number().int().min(0).optional(), // User B only
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log('=== Registration Request ===');
        console.log('Body:', JSON.stringify(body, null, 2));

        const validation = registerSchema.safeParse(body);

        if (!validation.success) {
            console.error('Validation failed:', validation.error.issues);
            return NextResponse.json({ error: validation.error.issues }, { status: 400 });
        }

        const { email, password, role, firstName, lastName, birthDate, gender, cityPreference, profession, experienceVerified, availability, bio, yearsExperience } = validation.data;

        // Use Admin client to create user without email confirmation
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                first_name: firstName,
                last_name: lastName,
                role: role,
            },
        });

        if (authError) {
            console.error('Auth error:', JSON.stringify(authError, null, 2));

            // Get error message from various possible fields
            const rawMessage = authError.message || (authError as any).msg || (authError as any).error_description || 'Erreur inconnue';
            const errorMessageLower = rawMessage.toLowerCase();
            let errorMessage = rawMessage;

            // Check for duplicate email/user errors (multiple variations)
            // Supabase can return: "A user with this email address has already been registered"
            if (errorMessageLower.includes('already been registered') ||
                errorMessageLower.includes('already exists') ||
                errorMessageLower.includes('user already registered') ||
                errorMessageLower.includes('email address has already') ||
                errorMessageLower.includes('a user with this email') ||
                errorMessageLower.includes('duplicate') ||
                errorMessageLower.includes('already registered') ||
                authError.status === 422 || // Supabase often returns 422 for duplicates
                (authError as any).code === '23505') { // PostgreSQL unique constraint violation
                errorMessage = 'Un compte avec cette adresse email existe déjà. Veuillez vous connecter ou utiliser une autre adresse email.';
            } else if (errorMessageLower.includes('password') || errorMessageLower.includes('weak')) {
                errorMessage = 'Le mot de passe doit contenir au moins 6 caractères.';
            } else if (errorMessageLower.includes('invalid email') || errorMessageLower.includes('email format')) {
                errorMessage = 'Adresse email invalide.';
            } else if (errorMessageLower.includes('email')) {
                errorMessage = 'Erreur liée à l\'adresse email: ' + rawMessage;
            }

            return NextResponse.json({ error: errorMessage }, { status: 400 });
        }

        if (!authData.user) {
            return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
        }

        const userId = authData.user.id;

        // 2. Create Profile
        // Using Admin client to ensure we can write to profiles even if RLS is strict for unconfirmed users
        // Note: email is stored in auth.users, not in profiles table
        const profileData = {
            id: userId,
            role,
            first_name: firstName,
            last_name: lastName,
            birth_date: birthDate,
            gender,
            avatar_url: DEFAULT_AVATAR_URL,
        };

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert(profileData);

        if (profileError) {
            console.error('Profile creation error:', profileError);
            return NextResponse.json({ error: 'Profile creation failed: ' + profileError.message }, { status: 500 });
        }

        // 3. Create Role Specific Details
        if (role === 'user_reconversion') {
            const { error: detailsError } = await supabaseAdmin
                .from('user_a_details')
                .insert({
                    user_id: userId,
                    city_preference: cityPreference,
                });

            if (detailsError) {
                console.error('User details error:', detailsError);
                return NextResponse.json({ error: 'User details creation failed' }, { status: 500 });
            }
        } else if (role === 'user_pro') {
            if (!profession || experienceVerified === undefined) {
                return NextResponse.json({ error: 'Missing User B fields' }, { status: 400 });
            }
            const { error: detailsError } = await supabaseAdmin
                .from('user_b_details')
                .insert({
                    user_id: userId,
                    profession,
                    experience_verified: experienceVerified,
                    availability: availability || null, // Store availability or null if not provided
                    bio: bio || null, // Store bio or null if not provided
                    years_experience: yearsExperience || null, // Store years_experience or null if not provided
                });

            if (detailsError) {
                console.error('User details error:', detailsError);
                return NextResponse.json({ error: 'User details creation failed' }, { status: 500 });
            }
        }

        return NextResponse.json({ message: 'User registered successfully', user: authData.user }, { status: 201 });

    } catch (error: any) {
        console.error('Register error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
