import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createReviewSchema = z.object({
    appointmentId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional(),
});

export async function POST(request: Request) {
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

        // Verify user is User A (reconversion)
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'user_reconversion') {
            return NextResponse.json({ error: 'Only User A can create reviews' }, { status: 403 });
        }

        const body = await request.json();
        const validation = createReviewSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues }, { status: 400 });
        }

        const { appointmentId, rating, comment } = validation.data;

        // Verify appointment exists and belongs to this user
        const { data: appointment, error: aptError } = await supabaseAdmin
            .from('appointments')
            .select('*')
            .eq('id', appointmentId)
            .single();

        if (aptError || !appointment) {
            return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
        }

        if (appointment.user_a_id !== user.id) {
            return NextResponse.json({ error: 'This is not your appointment' }, { status: 403 });
        }

        // Verify appointment is confirmed or completed and date has passed
        if (appointment.status !== 'CONFIRMED' && appointment.status !== 'COMPLETED') {
            return NextResponse.json({ error: 'Appointment must be confirmed or completed to review' }, { status: 400 });
        }

        const appointmentDate = new Date(appointment.date);
        if (appointmentDate > new Date()) {
            return NextResponse.json({ error: 'Cannot review future appointments' }, { status: 400 });
        }

        // Check if review already exists
        const { data: existingReview } = await supabaseAdmin
            .from('reviews')
            .select('id')
            .eq('appointment_id', appointmentId)
            .single();

        if (existingReview) {
            return NextResponse.json({ error: 'Review already exists for this appointment' }, { status: 400 });
        }

        // Create review
        const { data: review, error: reviewError } = await supabaseAdmin
            .from('reviews')
            .insert({
                user_a_id: user.id,
                user_b_id: appointment.user_b_id,
                appointment_id: appointmentId,
                rating,
                comment: comment || null,
            })
            .select()
            .single();

        if (reviewError) {
            console.error('Create review error:', reviewError);
            return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
        }

        return NextResponse.json({ review }, { status: 201 });

    } catch (error: any) {
        console.error('Review creation error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// GET - Fetch reviews for a professional
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userBId = searchParams.get('userBId');

        if (!userBId) {
            return NextResponse.json({ error: 'userBId required' }, { status: 400 });
        }

        const { data: reviews, error } = await supabaseAdmin
            .from('reviews')
            .select(`
                *,
                user_a:profiles!user_a_id(first_name, last_name)
            `)
            .eq('user_b_id', userBId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Fetch reviews error:', error);
            return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
        }

        return NextResponse.json({ reviews }, { status: 200 });

    } catch (error: any) {
        console.error('Fetch reviews error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
