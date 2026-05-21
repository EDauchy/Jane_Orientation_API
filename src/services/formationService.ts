// Service pour gérer la logique métier liée aux formations

export interface Formation {
    rnd: string;
    etab_nom: string;
    etab_gps: { lat: number; lon: number } | null;
    nm: string[];
    fiche: string;
    commune: string;
    // Champs optionnels utilisés pour le matching
    tf?: string[];
    fl?: string[];
    nmc?: string;
}

// Mapping entre domaines de carrière et mots-clés de formations
export const DOMAINS: { keywords: string[]; formations: string[] }[] = [
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

/**
 * Récupère les mots-clés de formations en fonction des métiers fournis
 * @param careers - Tableau des métiers/carrières
 * @returns Tableau des mots-clés de formations correspondants
 */
export function getFormationKeywordsFromCareers(careers: string[]): string[] {
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

    console.log("[formationService] Mots-clés générés:", Array.from(keywords));
    return Array.from(keywords);
}

/**
 * Vérifie si une formation correspond aux mots-clés
 * @param formation - Objet formation à vérifier
 * @param keywords - Tableau des mots-clés à rechercher
 * @returns true si la formation correspond à au moins un mot-clé
 */
export function matchesFormationKeywords(formation: Formation, keywords: string[]): boolean {
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

