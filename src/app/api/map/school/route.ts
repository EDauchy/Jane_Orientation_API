// src/app/api/map/school/route.ts
import type { NextRequest } from "next/server";
import { createClient, supabaseAdmin } from "@/lib/supabase";

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

const DOMAINS: { keywords: string[]; formations: string[] }[] = [
    {
        keywords: ["développeur", "full stack", "frontend", "backend", "devops", "architecte logiciel", "ingénieur logiciel", "chef de projet informatique", "cybersécurité", "data", "intelligence artificielle", "machine learning", "cloud", "administrateur système", "administrateur réseau", "analyste", "scrum", "product owner", "ux", "ui", "ingénieur informatique"],
        formations: ["informatique", "numérique", "but informatique", "génie logiciel", "systèmes d'information", "réseaux", "cybersécurité", "data", "intelligence artificielle", "développement"],
    },
    {
        keywords: ["médecin", "chirurgien", "généraliste", "spécialiste"],
        formations: ["médecine", "pass", "las", "santé"],
    },
    {
        keywords: ["infirmier", "aide-soignant"],
        formations: ["infirmier", "soins infirmiers", "ifsi"],
    },
    {
        keywords: ["kinésithérapeute", "kiné"],
        formations: ["kinésithérapie", "mkde", "rééducation"],
    },
    {
        keywords: ["pharmacien"],
        formations: ["pharmacie"],
    },
    {
        keywords: ["psychologue", "psychiatre"],
        formations: ["psychologie"],
    },
    {
        keywords: ["vétérinaire"],
        formations: ["vétérinaire", "env"],
    },
    {
        keywords: ["avocat", "juriste", "notaire", "magistrat"],
        formations: ["droit", "licence droit", "sciences juridiques"],
    },
    {
        keywords: ["comptable", "expert-comptable"],
        formations: ["comptabilité", "dcg", "dscg", "finance"],
    },
    {
        keywords: ["commercial", "vendeur", "technico-commercial"],
        formations: ["commerce", "bts ndrc", "bts mco", "vente"],
    },
    {
        keywords: ["marketing", "chef de produit", "chargé de marketing"],
        formations: ["marketing", "communication", "commerce"],
    },
    {
        keywords: ["manager", "directeur", "chef d'entreprise", "entrepreneur"],
        formations: ["management", "école de commerce", "gestion"],
    },
    {
        keywords: ["ressources humaines", "rh", "recruteur"],
        formations: ["ressources humaines", "gestion", "management"],
    },
    {
        keywords: ["finance", "trader", "analyste financier", "banquier", "gestionnaire"],
        formations: ["finance", "économie", "banque", "gestion"],
    },
    {
        keywords: ["ingénieur mécanique", "mécanicien"],
        formations: ["mécanique", "génie mécanique"],
    },
    {
        keywords: ["ingénieur électrique", "électronicien", "électrotechnicien"],
        formations: ["électronique", "électrotechnique", "génie électrique"],
    },
    {
        keywords: ["ingénieur chimiste", "chimiste"],
        formations: ["chimie", "génie chimique"],
    },
    {
        keywords: ["ingénieur civil", "génie civil", "conducteur de travaux"],
        formations: ["génie civil", "bâtiment", "travaux publics"],
    },
    {
        keywords: ["architecte"],
        formations: ["architecture", "école d'architecture"],
    },
    {
        keywords: ["designer", "graphiste", "webdesigner"],
        formations: ["design", "arts appliqués", "dnmade", "graphisme"],
    },
    {
        keywords: ["enseignant", "professeur", "formateur"],
        formations: ["éducation", "meef", "professorat"],
    },
    {
        keywords: ["journaliste", "rédacteur", "reporter"],
        formations: ["journalisme", "communication", "médias"],
    },
    {
        keywords: ["travailleur social", "éducateur spécialisé", "assistant social"],
        formations: ["travail social", "éducateur spécialisé", "assistant de service social"],
    },
    {
        keywords: ["animateur"],
        formations: ["animation", "bpjeps", "jeunesse"],
    },
    {
        keywords: ["cuisinier", "chef cuisinier", "pâtissier"],
        formations: ["cuisine", "restauration", "arts culinaires", "hôtellerie"],
    },
    {
        keywords: ["hôtelier", "réceptionniste"],
        formations: ["hôtellerie", "tourisme", "bts tourisme"],
    },
    {
        keywords: ["agriculteur", "agronome", "agroalimentaire"],
        formations: ["agriculture", "agronomie", "agroalimentaire"],
    },
    {
        keywords: ["environnement", "écologue", "développement durable"],
        formations: ["environnement", "écologie", "développement durable"],
    },
    {
        keywords: ["traducteur", "interprète"],
        formations: ["langues", "traduction", "lea"],
    },
    {
        keywords: ["coach sportif", "préparateur physique", "éducateur sportif"],
        formations: ["staps", "sport", "éducation physique"],
    },
    {
        keywords: ["chercheur", "scientifique"],
        formations: ["recherche", "master", "doctorat", "sciences"],
    },
];

function getFormationKeywordsFromCareers(careers: string[]): string[] {
    if (!careers || careers.length === 0) return [];

    const keywords = new Set<string>();

    for (const career of careers) {
        const careerLower = career.toLowerCase();

        for (const domain of DOMAINS) {
            const matched = domain.keywords.some(kw => careerLower.includes(kw));
            if (matched) {
                domain.formations.forEach(f => keywords.add(f.toLowerCase()));
                break;
            }
        }
    }

    console.log("[school] Mots-clés générés:", Array.from(keywords));
    return Array.from(keywords);
}

function matchesFormationKeywords(formation: any, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) return true;

    const searchableText = [
        formation.etab_nom || "",
        ...(formation.nm || []),
        ...(formation.tf || []),
        ...(formation.fl || []),
        formation.nmc || "",
    ]
        .join(" ")
        .toLowerCase();

    return keywords.some((kw) => searchableText.includes(kw));
}

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

        // 1. Récupération des métiers cibles depuis Supabase
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

        // 2. Génération des mots-clés (uniquement si le filtre est actif)
        const formationKeywords = filterByJobs
            ? getFormationKeywordsFromCareers(testResults)
            : [];

        // 3. Récupération paginée des formations depuis l'API Parcoursup
        const limit = 100;
        let offset = 0;
        let allResults: any[] = [];
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

            const results = data.results || [];
            allResults = [...allResults, ...results];

            if (results.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        }

        console.log("[school] Total formations récupérées:", allResults.length);

        // 4. Filtrage avec les mots-clés
        const filteredResults =
            formationKeywords.length > 0
                ? allResults.filter((f: any) => matchesFormationKeywords(f, formationKeywords))
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