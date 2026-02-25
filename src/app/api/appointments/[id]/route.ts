import { createClient, supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateAppointmentSchema = z.object({
    status: z.enum(['CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED']).optional(),
    date: z.string().datetime().optional(), // For rescheduling
    meetLink: z.string().url().optional(), // For confirmation
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        console.log('PATCH endpoint hit');

        // In Next.js 15, params is a Promise
        const { id } = await params;
        console.log('Appointment ID:', id);

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

        console.log(`PATCH /api/appointments/${id}:`, body);

        const validation = updateAppointmentSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues }, { status: 400 });
        }

        const { status, date, meetLink } = validation.data;

        // Fetch appointment to check permissions
        const { data: appointment, error: fetchError } = await supabaseAdmin
            .from('appointments')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !appointment) {
            return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
        }

        // Permission check
        const isUserA = appointment.user_a_id === user.id;
        const isUserB = appointment.user_b_id === user.id;

        if (!isUserA && !isUserB) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Status transitions
        // If a date is proposed, it's a rescheduling (RESCHEDULED status)
        // This should be allowed regardless of current status
        if (date && !status) {
            // Proposing a new date automatically means RESCHEDULED
            // This is allowed for both User A and User B from any status
        } else if (status) {
            // User B can confirm or cancel PENDING, OR propose a new date (which becomes RESCHEDULED)
            if (isUserB && appointment.status === 'PENDING') {
                if (status === 'RESCHEDULED' && date) {
                    // Allow rescheduling from PENDING
                } else if (status !== 'CONFIRMED' && status !== 'CANCELLED') {
                    return NextResponse.json({ error: 'Invalid status transition for Pro' }, { status: 400 });
                }
            }
            // User A can cancel CONFIRMED or PENDING, or propose reschedule
            else if (isUserA) {
                if (status === 'CANCELLED') {
                    // Allow cancellation
                } else if (status === 'RESCHEDULED' && date) {
                    // Allow rescheduling proposal (handled below)
                } else if (status === 'CONFIRMED' && appointment.status === 'RESCHEDULED' && appointment.proposed_by !== user.id) {
                    // Allow accepting reschedule
                } else {
                    return NextResponse.json({ error: 'Invalid status transition for User A' }, { status: 400 });
                }
            }
            // User B can reschedule, accept reschedule, or CANCEL
            else if (isUserB) {
                if (status === 'RESCHEDULED' && date) {
                    // Allow rescheduling
                } else if (status === 'CONFIRMED' && appointment.status === 'RESCHEDULED' && appointment.proposed_by !== user.id) {
                    // Allow accepting reschedule
                } else if (status === 'CANCELLED') {
                    // Allow cancellation
                } else {
                    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
                }
            }
            else {
                return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
            }
        }

        const updates: any = {};

        if (status) {
            if (status === 'CONFIRMED') {
                // Check if accepting a proposal
                if (appointment.proposed_date && appointment.proposed_by && appointment.proposed_by !== user.id) {
                    updates.date = appointment.proposed_date;
                    updates.proposed_date = null;
                    updates.proposed_by = null;
                    updates.status = 'CONFIRMED';
                    updates.meeting_link = meetLink || 'https://meet.google.com/new';
                } else {
                    // Normal confirmation
                    if (!isUserB) return NextResponse.json({ error: 'Only professional can confirm' }, { status: 403 });
                    updates.status = 'CONFIRMED';
                    updates.meeting_link = meetLink || 'https://meet.google.com/new';
                }
            } else if (status === 'CANCELLED') {
                updates.status = 'CANCELLED';
                updates.meeting_link = null;
                updates.cancelled_by = user.id; // Track who cancelled
                updates.proposed_date = null;
                updates.proposed_by = null;
            } else if (status === 'RESCHEDULED') {
                updates.status = 'RESCHEDULED';
            }
        }

        if (date) {
            updates.proposed_date = date;
            updates.proposed_by = user.id;
            updates.status = 'RESCHEDULED';
        }

        const { data: updatedAppointment, error: updateError } = await supabaseAdmin
            .from('appointments')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Supabase update error:', updateError);
            return NextResponse.json({ error: 'Failed to update appointment', details: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ appointment: updatedAppointment }, { status: 200 });

    } catch (error: any) {
        console.error('PATCH /api/appointments/[id] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
