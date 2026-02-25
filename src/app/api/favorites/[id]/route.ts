import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// Helper to get user from Bearer token
async function getUserFromRequest(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
        return null;
    }
    return user;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // In Next.js 15+, params is a Promise
        const { id } = await params;

        const { error } = await supabaseAdmin
            .from('favorites')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id); // Ensure ownership

        if (error) {
            return NextResponse.json({ error: 'Failed to delete favorite' }, { status: 500 });
        }

        return NextResponse.json({ message: 'Favorite deleted' }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
