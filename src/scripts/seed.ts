import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Must use Service Role for admin actions

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function seed() {
    console.log('🌱 Seeding database...');

    // 1. Create Users
    const users = [
        { email: 'admin@jane.com', password: 'password123', role: 'admin', first: 'Admin', last: 'User' },
        { email: 'userA@jane.com', password: 'password123', role: 'user_reconversion', first: 'Alice', last: 'Reconversion' },
        { email: 'userB@jane.com', password: 'password123', role: 'user_pro', first: 'Bob', last: 'Professional' },
        { email: 'userB2@jane.com', password: 'password123', role: 'user_pro', first: 'Charlie', last: 'Expert' },
    ];

    const createdUsers: any = {};

    for (const u of users) {
        console.log(`Creating user: ${u.email}`);

        // Check if user exists (by trying to sign in or just create)
        // Since we are admin, we can list users or just try to create.
        // `admin.createUser` is cleaner.

        // First try to find user by email to avoid duplicates error log
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        let userId = existingUsers.users.find(user => user.email === u.email)?.id;

        if (!userId) {
            const { data, error } = await supabase.auth.admin.createUser({
                email: u.email,
                password: u.password,
                email_confirm: true,
                user_metadata: {
                    first_name: u.first,
                    last_name: u.last,
                    role: u.role
                }
            });

            if (error) {
                console.error(`Failed to create ${u.email}:`, error.message);
                continue;
            }
            userId = data.user.id;
        } else {
            console.log(`User ${u.email} already exists.`);
        }

        createdUsers[u.role] = createdUsers[u.role] || [];
        createdUsers[u.role].push(userId);

        // Upsert Profile (email is stored in auth.users, not in profiles)
        const { error: profileError } = await supabase.from('profiles').upsert({
            id: userId,
            first_name: u.first,
            last_name: u.last,
            role: u.role,
            birth_date: '1990-01-01',
            gender: 'PREFER_NOT_SAY'
        });

        if (profileError) console.error(`Profile error for ${u.email}:`, profileError.message);

        // Role specific details
        if (u.role === 'user_reconversion') {
            await supabase.from('user_a_details').upsert({
                user_id: userId,
                city_preference: 'Paris',
                test_results: ['Développeur Web', 'Data Analyst', 'UX Designer']
            });
        } else if (u.role === 'user_pro') {
            await supabase.from('user_b_details').upsert({
                user_id: userId,
                profession: u.first === 'Bob' ? 'Développeur Web' : 'Data Scientist',
                experience_verified: true,
                bio: 'Expert avec 10 ans d\'expérience.',
                years_experience: u.first === 'Bob' ? 5 : 10
            });
        }
    }

    // 2. Create Appointments
    if (createdUsers['user_reconversion']?.[0] && createdUsers['user_pro']?.[0]) {
        console.log('Creating appointments...');
        const userA = createdUsers['user_reconversion'][0];
        const userB = createdUsers['user_pro'][0];

        const appointments = [
            { user_a_id: userA, user_b_id: userB, date: new Date(Date.now() + 86400000).toISOString(), status: 'PENDING' },
            { user_a_id: userA, user_b_id: userB, date: new Date(Date.now() + 172800000).toISOString(), status: 'CONFIRMED', meeting_link: 'https://meet.google.com/abc-defg-hij' },
            { user_a_id: userA, user_b_id: userB, date: new Date(Date.now() - 86400000).toISOString(), status: 'CANCELLED' },
        ];

        for (const apt of appointments) {
            await supabase.from('appointments').insert(apt);
        }
    }

    // 3. Create Favorites
    if (createdUsers['user_reconversion']?.[0]) {
        console.log('Creating favorites...');
        const userA = createdUsers['user_reconversion'][0];

        await supabase.from('favorites').insert([
            { user_id: userA, item_type: 'training', item_id: '123', item_data: { name: 'Formation React', location: 'Paris' } },
            { user_id: userA, item_type: 'housing', item_id: '456', item_data: { name: 'Appartement Etudiant', location: 'Lyon' } },
            { user_id: userA, item_type: 'training', item_id: '789', item_data: { name: 'Bootcamp Data', location: 'Remote' } },
        ]);
    }

    console.log('✅ Seeding complete!');
    console.log('Test Accounts:');
    users.forEach(u => console.log(`- ${u.email} / ${u.password} (${u.role})`));
}

seed();
