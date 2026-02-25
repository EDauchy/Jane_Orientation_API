import { fetchAlternanceCenters } from '@/services/normalizationService';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const data = await fetchAlternanceCenters(city, limit, offset);

    return NextResponse.json(data);
}
