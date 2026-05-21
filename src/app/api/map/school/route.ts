// src/app/api/map/school/route.ts
import type { NextRequest } from "next/server";
import { createClient, supabaseAdmin } from "@/lib/supabase";
import {
    Formation,
    getFormationKeywordsFromCareers,
    matchesFormationKeywords,
} from "@/services/formationService";

const API_BASE =
    "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-cartographie_formations_parcoursup/records";


export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const city = url.searchParams.get("city");
        const type = url.searchParams.get("type");
        const filterByJobs = url.searchParams.get("filter") !== "false";

        if (!city) {
            return new Response(JSON.stringify([]), {
                headers: { "Content-Type": "application/json" },
            });
        }

        // Retrieving target trades from Supabase
        let testResults: string[] = [];
        try {
            const authHeader = req.headers.get("Authorization");
            const token = authHeader?.replace("Bearer ", "");

            if (token) {
                const supabase = await createClient();
                const {
                    data: { user },
                    error: authError,
                } = await supabase.auth.getUser(token);

                if (!authError && user) {
                    const { data: userDetails, error } = await supabaseAdmin
                        .from("user_a_details")
                        .select("test_results")
                        .eq("user_id", user.id)
                        .single();

                    if (
                        !error &&
                        userDetails?.test_results &&
                        Array.isArray(userDetails.test_results)
                    ) {
                        testResults = userDetails.test_results;
                    }
                }
            }
        } catch (err) {
            console.error("[school] Erreur lors de la récupération des test_results:", err);
        }

        console.log("[school] testResults:", testResults);
        console.log("[school] filterByJobs:", filterByJobs);

        // Keyword generation (only if the filter is active)
        const formationKeywords = filterByJobs
            ? getFormationKeywordsFromCareers(testResults)
            : [];

        // Paged retrieval of training courses from the Parcoursup API
        const limit = 100;
        let offset = 0;
        let allResults: Formation[] = [];
        let hasMore = true;

        const year = new Date().getFullYear().toString();

        while (hasMore) {
            let whereClause = `annee LIKE "${year}" AND commune LIKE "${city}"`;

            if (type === "alternance") {
                whereClause += ` AND app LIKE "Formations en apprentissage"`;
            }

            const apiUrl = `${API_BASE}?where=${encodeURIComponent(
                whereClause
            )}&limit=${limit}&offset=${offset}`;

            const res = await fetch(apiUrl);
            const data = await res.json();

            const results: Formation[] = data.results || [];
            allResults = [...allResults, ...results];

            if (results.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        }

        console.log("[school] Total formations récupérées:", allResults.length);

        // Filtering formations based on generated keywords
        const filteredResults =
            formationKeywords.length > 0
                ? allResults.filter((f: Formation) => matchesFormationKeywords(f, formationKeywords))
                : allResults;

        console.log("[school] Formations après filtrage:", filteredResults.length);

        const formations: Formation[] = filteredResults.map((f: any) => ({
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
        console.error("[school] Erreur API school:", err);
        return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json" },
        });
    }
}