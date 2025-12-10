import { createClient, supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createAppointmentSchema = z.object({
    userBId: z.string().uuid(),
    date: z.string().datetime(), // ISO string
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

        // Verify User A role
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'user_reconversion') {
            return NextResponse.json({ error: 'Only User A can request appointments' }, { status: 403 });
        }

        const body = await request.json();
        const validation = createAppointmentSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues }, { status: 400 });
        }

        const { userBId, date } = validation.data;

        // Verify User B exists and is a pro
        const { data: pro } = await supabaseAdmin
            .from('profiles')
            .select('role, user_b_details(profession)')
            .eq('id', userBId)
            .single();

        if (!pro || pro.role !== 'user_pro') {
            return NextResponse.json({ error: 'Invalid professional ID' }, { status: 400 });
        }

        const profession = (pro.user_b_details as any)?.profession;

        // CONSTRAINT 1: Max 1 active appointment with THIS professional
        const { count: activeCount, error: activeError } = await supabaseAdmin
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('user_a_id', user.id)
            .eq('user_b_id', userBId)
            .in('status', ['PENDING', 'CONFIRMED', 'RESCHEDULED']);

        if (activeError) {
            return NextResponse.json({ error: 'Failed to check active appointments' }, { status: 500 });
        }

        if (activeCount && activeCount > 0) {
            return NextResponse.json({ error: 'Vous avez déjà un rendez-vous actif avec ce professionnel.' }, { status: 400 });
        }

        // CONSTRAINT 2: Max 2 appointments TOTAL for this PROFESSION
        // We need to find all appointments of User A where the User B has the same profession
        // This is complex in Supabase/PostgREST without a join on the count.
        // We'll fetch User A's appointments and filter manually or use a join if possible.
        // Simplest reliable way: Fetch all User A appointments, get their User B IDs, fetch those User Bs' professions.

        const { data: userAAppointments, error: historyError } = await supabaseAdmin
            .from('appointments')
            .select('user_b_id')
            .eq('user_a_id', user.id)
            .in('status', ['CONFIRMED', 'COMPLETED']); // Count confirmed and completed as "consumed" slots? Or just total?
        // User asked: "max 2 rdv par metier ... afin d'eviter les abus"
        // Usually implies total history. Let's count CONFIRMED and COMPLETED.

        if (historyError) {
            return NextResponse.json({ error: 'Failed to check appointment history' }, { status: 500 });
        }

        if (userAAppointments && userAAppointments.length > 0) {
            const userBIds = userAAppointments.map(a => a.user_b_id);

            // Fetch professions for these User Bs (unique)
            const { data: prosDetails, error: prosError } = await supabaseAdmin
                .from('user_b_details')
                .select('user_id, profession')
                .in('user_id', userBIds);

            if (!prosError && prosDetails) {
                // Create a map of userId -> profession
                const proMap = new Map(prosDetails.map(p => [p.user_id, p.profession]));

                // Count appointments that match the target profession
                let sameProfessionCount = 0;
                for (const apt of userAAppointments) {
                    if (proMap.get(apt.user_b_id) === profession) {
                        sameProfessionCount++;
                    }
                }

                if (sameProfessionCount >= 2) {
                    return NextResponse.json({ error: `Vous avez atteint la limite de 2 rendez-vous pour le métier : ${profession}.` }, { status: 400 });
                }
            }
        }

        // Generate Google Meet Link (Simulated)
        const meetingLink = `https://meet.google.com/${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 5)}`;

        // Create Appointment
        const { data, error } = await supabaseAdmin
            .from('appointments')
            .insert({
                user_a_id: user.id,
                user_b_id: userBId,
                date: date,
                status: 'PENDING',
                meeting_link: meetingLink
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
        }

        return NextResponse.json({ appointment: data }, { status: 201 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
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

        // Auto-update past confirmed appointments to COMPLETED
        const now = new Date().toISOString();

        // We can do this efficiently by updating any appointment involving this user
        // that is CONFIRMED and in the past.
        const { error: updateError } = await supabaseAdmin
            .from('appointments')
            .update({ status: 'COMPLETED' })
            .eq('status', 'CONFIRMED')
            .lt('date', now)
            .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);

        if (updateError) {
            console.error('Auto-complete update error:', updateError);
            // Continue anyway to show appointments
        }

        // Fetch appointments where user is A or B
        const { data: appointments, error } = await supabaseAdmin
            .from('appointments')
            .select(`
                *,
                user_a:profiles!user_a_id(id, first_name, last_name),
                user_b:profiles!user_b_id(id, first_name, last_name, user_b_details(profession, availability))
            `)
            .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
            .order('date', { ascending: false });

        if (error) {
            console.error('Fetch Appointments Error:', error);
            return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
        }

        // Fetch all reviews for these appointments separately
        const appointmentIds = appointments.map(a => a.id);
        const { data: reviews } = await supabaseAdmin
            .from('reviews')
            .select('appointment_id, rating, comment')
            .in('appointment_id', appointmentIds);

        // Create a map of appointment_id -> review
        const reviewMap = new Map();
        if (reviews) {
            reviews.forEach(review => {
                reviewMap.set(review.appointment_id, {
                    rating: review.rating,
                    comment: review.comment
                });
            });
        }

        // Add has_review flag and review data to appointments
        const appointmentsWithReview = appointments.map(apt => {
            const review = reviewMap.get(apt.id);
            console.log(`Appointment ${apt.id}: review from map:`, review);
            return {
                ...apt,
                has_review: !!review,
                review: review || undefined
            };
        });

        console.log('Returning appointments with review data:', appointmentsWithReview.map(a => ({
            id: a.id,
            has_review: a.has_review,
            review: a.review
        })));

        return NextResponse.json({ appointments: appointmentsWithReview }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
