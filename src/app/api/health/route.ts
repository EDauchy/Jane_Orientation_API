import { NextResponse } from 'next/server';

// Route: GET /api/health
// Retourne un statut simple pour vérifier que l'application fonctionne
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}

