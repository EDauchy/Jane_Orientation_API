import { supabaseAdmin } from '@/lib/supabase';

/**
 * Récupère les mots-clés associés à un métier depuis la base de données
 * @param jobName Nom du métier
 * @returns Tableau de mots-clés ou null si non trouvé
 */
export async function getJobKeywords(jobName: string): Promise<string[] | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('job_keywords')
            .select('keywords')
            .eq('job_name', jobName)
            .single();

        if (error || !data) {
            return null;
        }

        return data.keywords || null;
    } catch (e) {
        console.error('Error fetching job keywords:', e);
        return null;
    }
}

/**
 * Récupère les mots-clés pour plusieurs métiers
 * @param jobNames Liste des noms de métiers
 * @returns Map avec le nom du métier comme clé et les mots-clés comme valeur
 */
export async function getMultipleJobKeywords(jobNames: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();

    if (jobNames.length === 0) {
        return result;
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('job_keywords')
            .select('job_name, keywords')
            .in('job_name', jobNames);

        if (error || !data) {
            return result;
        }

        for (const row of data) {
            if (row.keywords && Array.isArray(row.keywords)) {
                result.set(row.job_name, row.keywords);
            }
        }

        return result;
    } catch (e) {
        console.error('Error fetching multiple job keywords:', e);
        return result;
    }
}

/**
 * Enregistre ou met à jour les mots-clés pour un métier
 * @param jobName Nom du métier
 * @param keywords Tableau de mots-clés associés
 */
export async function saveJobKeywords(jobName: string, keywords: string[]): Promise<void> {
    try {
        const { error } = await supabaseAdmin
            .from('job_keywords')
            .upsert(
                {
                    job_name: jobName,
                    keywords: keywords,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: 'job_name',
                }
            );

        if (error) {
            console.error('Error saving job keywords:', error);
            throw error;
        }
    } catch (e) {
        console.error('Error in saveJobKeywords:', e);
        throw e;
    }
}

/**
 * Vérifie si un établissement correspond aux mots-clés d'un métier
 * @param establishment Informations sur l'établissement
 * @param keywords Mots-clés à rechercher
 * @returns true si correspondance trouvée
 */
export function matchesKeywords(
    establishment: {
        name: string;
        description?: string;
        specialities?: string[];
    },
    keywords: string[]
): boolean {
    if (!keywords || keywords.length === 0) {
        return false;
    }

    // Normaliser les textes pour la recherche
    const normalize = (str: string) => str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    const normalizedKeywords = keywords.map(normalize);
    const name = normalize(establishment.name);
    const description = normalize(establishment.description || '');
    const specialities = (establishment.specialities || []).map(normalize).join(' ');
    const searchableText = `${name} ${description} ${specialities}`;

    // Vérifier si au moins un mot-clé est présent dans le texte
    return normalizedKeywords.some(keyword => {
        // Recherche exacte du mot-clé
        if (searchableText.includes(keyword)) {
            return true;
        }
        // Recherche par mots individuels (pour les mots-clés composés)
        const keywordWords = keyword.split(/\s+/).filter(w => w.length > 2);
        if (keywordWords.length > 1) {
            // Si au moins 50% des mots du mot-clé sont présents
            const foundWords = keywordWords.filter(word => searchableText.includes(word));
            return foundWords.length >= Math.ceil(keywordWords.length * 0.5);
        }
        return false;
    });
}
