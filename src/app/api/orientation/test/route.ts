import { supabaseAdmin } from '@/lib/supabase';
import { getJobSuggestions } from '@/services/llmService';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const testSchema = z.object({
    answers: z.record(z.string(), z.string()), // Key: question, Value: answer
});

export async function POST(request: Request) {
    try {
        // Get Authorization header
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify user with token using admin client
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify User A (user_reconversion)
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'user_reconversion') {
            return NextResponse.json({ error: 'Seuls les utilisateurs en reconversion peuvent passer ce test' }, { status: 403 });
        }

        const body = await request.json();
        const validation = testSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({
                error: 'Données invalides: ' + validation.error.issues.map((e) => e.message).join(', ')
            }, { status: 400 });
        }

        const { answers } = validation.data;

        // Ensure answers is Record<string, string>
        const typedAnswers: Record<string, string> = {};
        for (const [key, value] of Object.entries(answers)) {
            if (typeof value === 'string') {
                typedAnswers[key] = value;
            }
        }

        // Call LLM
        let jobs: string[] = [];
        try {
            jobs = await getJobSuggestions(typedAnswers);

            // Validate that we got results
            if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
                console.error('LLM returned empty or invalid results');
                return NextResponse.json({ error: 'Aucune suggestion de métier n\'a pu être générée. Veuillez réessayer.' }, { status: 500 });
            }
        } catch (e: any) {
            console.error('LLM Error:', e);
            return NextResponse.json({
                error: 'Erreur lors de la génération des suggestions: ' + (e.message || 'Erreur inconnue')
            }, { status: 500 });
        }

        // Save results (upsert to handle case where user_a_details doesn't exist yet)
        const { error: saveError } = await supabaseAdmin
            .from('user_a_details')
            .upsert({
                user_id: user.id,
                test_results: jobs
            }, {
                onConflict: 'user_id'
            });

        if (saveError) {
            console.error('Save Error:', saveError);
            return NextResponse.json({ error: 'Échec de la sauvegarde des résultats' }, { status: 500 });
        }

        return NextResponse.json({ metiers: jobs }, { status: 200 });

    } catch (error: any) {
        console.error('Test API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
