import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createFavoriteSchema = z.object({
    resourceType: z.enum(['TRAINING', 'HOUSING', 'UNIVERSITY', 'ALTERNANCE']),
    resourceExternalId: z.string(),
    resourceData: z.any(), // JSON data
});

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

export async function GET(request: Request) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabaseAdmin
            .from('favorites')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
        }

        return NextResponse.json({ favorites: data }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Support both old format (item_type, item_id) and new format (resourceType, resourceExternalId)
        const normalizedBody = {
            resourceType: body.resourceType || body.item_type?.toUpperCase() || body.type?.toUpperCase(),
            resourceExternalId: body.resourceExternalId || body.item_id || body.id,
            resourceData: body.resourceData || body.item_data || body,
        };

        const validation = createFavoriteSchema.safeParse(normalizedBody);

        if (!validation.success) {
            console.error('Validation error:', validation.error.errors);
            return NextResponse.json({ error: validation.error.errors }, { status: 400 });
        }

        const { resourceType, resourceExternalId, resourceData } = validation.data;

        // Check if already exists - use item_type and item_id for compatibility
        const { data: existing } = await supabaseAdmin
            .from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('item_type', resourceType.toLowerCase())
            .eq('item_id', resourceExternalId)
            .single();

        if (existing) {
            return NextResponse.json({ message: 'Already in favorites' }, { status: 200 });
        }

        const { data, error } = await supabaseAdmin
            .from('favorites')
            .insert({
                user_id: user.id,
                item_type: resourceType.toLowerCase(),
                item_id: resourceExternalId,
                item_data: resourceData,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
        }

        return NextResponse.json({ favorite: data }, { status: 201 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
