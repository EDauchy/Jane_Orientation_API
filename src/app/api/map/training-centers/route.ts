import { fetchTrainingCenters } from '@/services/normalizationService';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || undefined;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const data = await fetchTrainingCenters(city, limit, offset);

    return NextResponse.json(data);
}
