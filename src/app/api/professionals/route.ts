import { createClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const job = searchParams.get('job');

        const supabase = await createClient();

        // We need to join profiles and user_b_details
        // Supabase join syntax:
        let query = supabase
            .from('profiles')
            .select('*, user_b_details!inner(*)') // inner join to ensure we only get those with details (User B)
            .eq('role', 'user_pro');

        if (job) {
            // Filter by profession in user_b_details
            // Syntax for filtering on joined table:
            query = query.ilike('user_b_details.profession', `%${job}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching professionals:', error);
            return NextResponse.json({ error: 'Failed to fetch professionals' }, { status: 500 });
        }

        return NextResponse.json({ professionals: data }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
