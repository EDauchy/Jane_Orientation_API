import { createClient, supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        // Get Authorization header
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        // Get Auth User using the token
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get Profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Get Role Details (using Admin client to bypass RLS)
        let details = null;
        if (profile.role === 'user_reconversion') {
            const { data, error } = await supabaseAdmin
                .from('user_a_details')
                .select('*')
                .eq('user_id', user.id)
                .single();
            if (error) {
                console.error('Error fetching user_a_details:', error);
            }
            details = data;
        } else if (profile.role === 'user_pro') {
            const { data, error } = await supabaseAdmin
                .from('user_b_details')
                .select('*')
                .eq('user_id', user.id)
                .single();
            if (error) {
                console.error('Error fetching user_b_details:', error);
            }
            details = data;
        }

        return NextResponse.json({ user: { ...profile, details } }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
