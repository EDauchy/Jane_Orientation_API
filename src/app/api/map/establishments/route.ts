import { fetchAllEstablishments } from '@/services/normalizationService';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100');

    const includeHousing = searchParams.get('housing') !== 'false';
    const includeTraining = searchParams.get('training') !== 'false';
    const includeUniversities = searchParams.get('universities') !== 'false';
    const includeAlternance = searchParams.get('alternance') !== 'false';

    // Get suggested jobs from query params
    const suggestedJobs = searchParams.getAll('jobs') || [];

    try {
        const data = await fetchAllEstablishments(city, {
            includeHousing,
            includeTraining,
            includeUniversities,
            includeAlternance,
            limit,
            suggestedJobs: suggestedJobs.length > 0 ? suggestedJobs : undefined,
        });

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching establishments:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des établissements' },
            { status: 500 }
        );
    }
}
