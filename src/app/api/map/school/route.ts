// src/app/api/map/school.ts
import type { NextRequest } from "next/server";

interface Formation {
    rnd: string;
    etab_nom: string;
    etab_gps: { lat: number; lon: number } | null;
    nm: string[];
    fiche: string;
    commune: string;
}

const API_BASE =
    "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-cartographie_formations_parcoursup/records";

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const city = url.searchParams.get("city");
        const type = url.searchParams.get("type");

        if (!city) {
            return new Response(JSON.stringify([]), {
                headers: { "Content-Type": "application/json" },
            });
        }

        const limit = 100;
        let offset = 0;
        let allResults: any[] = [];
        let hasMore = true;

        while (hasMore) {
            let whereClause = `annee LIKE "2026" AND commune LIKE "${city}"`;

            if (type === "alternance") {
                whereClause += ` AND app LIKE "Formations en apprentissage"`;
            }

            const apiUrl = `${API_BASE}?where=${encodeURIComponent(
                whereClause
            )}&limit=${limit}&offset=${offset}`;

            const res = await fetch(apiUrl);
            const data = await res.json();

            const results = data.results || [];
            allResults = [...allResults, ...results];

            if (results.length < limit) {
                hasMore = false; // plus de données
            } else {
                offset += limit;
            }
        }

        const formations: Formation[] = allResults.map((f: any) => ({
            rnd: f.rnd,
            etab_nom: f.etab_nom,
            etab_gps: f.etab_gps,
            nm: f.nm || [],
            fiche: f.fiche,
            commune: f.commune,
        }));

        return new Response(JSON.stringify(formations), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (err) {
        console.error("Erreur API school:", err);
        return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json" },
        });
    }
}