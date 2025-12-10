// Service de normalisation des données depuis les APIs data.gouv.fr
// Sources: https://www.data.gouv.fr/dataservices/

import { batchMatchEstablishments } from './llmService';
import { getMultipleJobKeywords, saveJobKeywords, matchesKeywords } from './jobKeywordsService';

export interface NormalizedResource {
    id: string;
    name: string;
    address: string;
    position: { lat: number; lon: number };
    contact: {
        email?: string;
        phone?: string;
        website?: string;
    };
    openingHours?: string;
    description?: string;
    specialities?: string[]; // Spécialités de formation pour filtrage
    tags: {
        alternance: boolean;
        financed: boolean;
        university: boolean;
        private: boolean;
        adultTraining: boolean;
    };
    source: string;
    sourceId?: string;
}

// 1. Logements CROUS
// API: https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr_crous_logement_france_entiere/records
export async function fetchHousing(city?: string, limit = 50, offset = 0): Promise<NormalizedResource[]> {
    const baseUrl = 'https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr_crous_logement_france_entiere/records';
    const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
    });

    // Utiliser where pour filtrer par ville dans le champ zone
    if (city) {
        query.append('where', `zone like "%${city}%"`);
    }

    try {
        const response = await fetch(`${baseUrl}?${query.toString()}`);
        if (!response.ok) {
            console.error('CROUS API error:', response.status, response.statusText);
            return [];
        }
        const data = await response.json();

        return (data.results || [])
            .map((record: any) => {
                // Les données CROUS sont directement dans record, pas dans record.record.fields
                const geoloc = record.geocalisation || record.geolocalisation;
                const lat = geoloc?.lat || 0;
                const lon = geoloc?.lon || 0;

                // Extraire email et téléphone du champ contact
                const contactText = record.contact || '';
                const emailMatch = contactText.match(/[\w.-]+@[\w.-]+\.\w+/);
                const phoneMatch = contactText.match(/(?:\+33|0)[1-9](?:[.\s-]?\d{2}){4}/);

                return {
                    id: `crous-${record.id || Math.random().toString()}`,
                    name: record.title || 'Logement CROUS',
                    address: record.address || record.zone || '',
                    position: {
                        lat: lat,
                        lon: lon,
                    },
                    contact: {
                        email: record.mail || emailMatch?.[0],
                        phone: record.phone || phoneMatch?.[0],
                        website: record.interneturl,
                    },
                    openingHours: record.openinghours || (contactText.includes('Horaires') ? contactText.split('Horaires')[1]?.split('\n')[0] : undefined),
                    description: record.infos || record.short_desc,
                    tags: {
                        alternance: false,
                        financed: true,
                        university: true,
                        private: false,
                        adultTraining: false,
                    },
                    source: 'crous',
                    sourceId: record.id?.toString(),
                };
            })
            .filter((item: NormalizedResource) => item.position.lat !== 0 && item.position.lon !== 0);
    } catch (e) {
        console.error('Error fetching CROUS housing:', e);
        return [];
    }
}

// 2. Centres de Formation (Organismes de Formation)
// API: https://dgefp.opendatasoft.com/api/explore/v2.1/catalog/datasets/liste-publique-des-of-v2/records
export async function fetchTrainingCenters(city?: string, limit = 50, offset = 0): Promise<NormalizedResource[]> {
    const baseUrl = 'https://dgefp.opendatasoft.com/api/explore/v2.1/catalog/datasets/liste-publique-des-of-v2/records';
    const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
    });

    // Utiliser le bon nom de champ pour la ville
    if (city) {
        query.append('refine', `adressephysiqueorganismeformation_ville:${city.toUpperCase()}`);
    }

    try {
        const response = await fetch(`${baseUrl}?${query.toString()}`);
        if (!response.ok) {
            console.error('DGEFP API error:', response.status, response.statusText);
            return [];
        }
        const data = await response.json();

        return (data.results || [])
            .map((record: any) => {
                // Les données sont directement dans record
                const geoloc = record.geocodageban;
                const lat = geoloc?.lat || 0;
                const lon = geoloc?.lon || 0;

                const hasAlternance = record.certifications_actionsdeformationparapprentissage === 'true' ||
                                     record.certifications?.includes('Actions de formations par apprentissage');

                const address = [
                    record.adressephysiqueorganismeformation_voie,
                    record.adressephysiqueorganismeformation_codepostal,
                    record.adressephysiqueorganismeformation_ville
                ].filter(Boolean).join(', ');

                return {
                    id: `of-${record.siren || record.numerodeclarationactivite || Math.random().toString()}`,
                    name: record.denomination || 'Organisme de Formation',
                    address: address,
                    position: {
                        lat: lat,
                        lon: lon,
                    },
                    contact: {
                        email: undefined, // Pas d'email dans cette API
                        phone: undefined, // Pas de téléphone dans cette API
                        website: undefined,
                    },
                    openingHours: undefined,
                    description: record.toutes_specialites?.join(', ') || undefined,
                    specialities: record.toutes_specialites || [],
                    tags: {
                        alternance: hasAlternance,
                        financed: record.certifications_actionsdeformation === 'true',
                        university: false,
                        private: true,
                        adultTraining: true,
                    },
                    source: 'dgefp',
                    sourceId: record.siren,
                };
            })
            .filter((item: NormalizedResource) => item.position.lat !== 0 && item.position.lon !== 0);
    } catch (e) {
        console.error('Error fetching training centers:', e);
        return [];
    }
}

// 3. Universités et établissements d'enseignement supérieur
// API: https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur/records
export async function fetchUniversities(city?: string, limit = 50, offset = 0): Promise<NormalizedResource[]> {
    const baseUrl = 'https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur/records';
    const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
    });

    // Utiliser le bon nom de champ pour la ville
    if (city) {
        query.append('refine', `com_nom:${city}`);
    }

    try {
        const response = await fetch(`${baseUrl}?${query.toString()}`);
        if (!response.ok) {
            console.error('ESR API error:', response.status, response.statusText);
            return [];
        }
        const data = await response.json();

        return (data.results || [])
            .map((record: any) => {
                // Les données sont directement dans record
                const coords = record.coordonnees;
                const lat = coords?.lat || 0;
                const lon = coords?.lon || 0;

                const address = [
                    record.adresse_uai,
                    record.code_postal_uai,
                    record.localite_acheminement_uai || record.com_nom
                ].filter(Boolean).join(', ');

                return {
                    id: `univ-${record.etablissement_id_paysage || record.uai || Math.random().toString()}`,
                    name: record.uo_lib || record.uo_lib_officiel || 'Établissement d\'enseignement supérieur',
                    address: address,
                    position: {
                        lat: lat,
                        lon: lon,
                    },
                    contact: {
                        email: undefined, // Pas d'email dans cette API
                        phone: record.numero_telephone_uai,
                        website: record.url,
                    },
                    openingHours: undefined,
                    description: record.typologie_d_universites_et_assimiles || record.type_d_etablissement?.join(', '),
                    tags: {
                        alternance: false, // Pas d'info directe dans cette API
                        financed: true,
                        university: true,
                        private: record.secteur_d_etablissement === 'privé',
                        adultTraining: false,
                    },
                    source: 'esr',
                    sourceId: record.etablissement_id_paysage || record.uai,
                };
            })
            .filter((item: NormalizedResource) => item.position.lat !== 0 && item.position.lon !== 0);
    } catch (e) {
        console.error('Error fetching universities:', e);
        return [];
    }
}

// 4. Établissements proposant de l'alternance
// Utilise l'API des OF avec filtre alternance + API des universités avec alternance
export async function fetchAlternanceCenters(city?: string, limit = 50, offset = 0): Promise<NormalizedResource[]> {
    const [trainingCenters, universities] = await Promise.all([
        fetchTrainingCenters(city, limit, offset),
        fetchUniversities(city, limit, offset),
    ]);

    // Filtrer pour ne garder que ceux qui proposent de l'alternance
    const allWithAlternance = [
        ...trainingCenters.filter(item => item.tags.alternance),
        // Pour les universités, on ne peut pas filtrer directement, donc on les inclut tous
        // car beaucoup proposent de l'alternance même si ce n'est pas indiqué dans l'API
        ...universities,
    ];

    return allWithAlternance.slice(0, limit);
}

/**
 * Extrait les mots-clés pertinents d'un ensemble d'établissements pour un métier donné
 * @param establishments Établissements qui correspondent au métier
 * @param jobName Nom du métier
 * @returns Tableau de mots-clés extraits
 */
function extractKeywordsFromEstablishments(
    establishments: NormalizedResource[],
    jobName: string
): string[] {
    const keywords = new Set<string>();

    // Normaliser le nom du métier pour extraction
    const normalize = (str: string) => str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const normalizedJob = normalize(jobName);
    const jobWords = normalizedJob.split(/\s+/).filter(w => w.length > 2);

    for (const establishment of establishments) {
        // Extraire des mots-clés depuis le nom
        const nameWords = establishment.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        nameWords.forEach(word => {
            if (!jobWords.includes(word) && word.length > 3) {
                keywords.add(word);
            }
        });

        // Extraire des mots-clés depuis la description
        if (establishment.description) {
            const descWords = establishment.description.toLowerCase()
                .split(/[,\s]+/)
                .filter(w => w.length > 3 && !jobWords.includes(w));
            descWords.forEach(word => keywords.add(word));
        }

        // Extraire des mots-clés depuis les spécialités
        if (establishment.specialities && establishment.specialities.length > 0) {
            establishment.specialities.forEach(spec => {
                const specWords = spec.toLowerCase()
                    .split(/[,\s]+/)
                    .filter(w => w.length > 3 && !jobWords.includes(w));
                specWords.forEach(word => keywords.add(word));
            });
        }
    }

    // Limiter à 20 mots-clés les plus pertinents
    return Array.from(keywords).slice(0, 20);
}

// Helper function to check if an establishment matches suggested jobs (fallback)
function matchesSuggestedJobs(establishment: NormalizedResource, suggestedJobs?: string[]): boolean {
    if (!suggestedJobs || suggestedJobs.length === 0) {
        return true; // No filter, show all
    }

    // Normalize job names for matching (lowercase, remove accents, etc.)
    const normalize = (str: string) => str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    const normalizedJobs = suggestedJobs.map(normalize);

    // Check if establishment name or description contains any suggested job
    const name = normalize(establishment.name);
    const description = normalize(establishment.description || '');
    const address = normalize(establishment.address || '');
    const specialities = (establishment.specialities || []).map(normalize).join(' ');

    // Keywords mapping for better matching (métiers français vers mots-clés de formations)
    const jobKeywords: Record<string, string[]> = {
        'developpeur': ['développeur', 'developer', 'programmation', 'code', 'informatique', 'web', 'software', 'développement', 'programmeur'],
        'developpeur web': ['développeur', 'web', 'front-end', 'back-end', 'fullstack', 'javascript', 'react', 'vue', 'angular'],
        'developpeur front-end': ['front-end', 'frontend', 'web', 'javascript', 'react', 'vue', 'angular', 'html', 'css'],
        'data analyst': ['data', 'analyst', 'analyse', 'statistique', 'business intelligence', 'bi', 'analytics', 'tableau', 'power bi'],
        'ux designer': ['ux', 'ui', 'designer', 'design', 'interface', 'utilisateur', 'ergonomie', 'expérience utilisateur'],
        'ui/ux designer': ['ux', 'ui', 'designer', 'design', 'interface', 'utilisateur', 'ergonomie', 'expérience utilisateur'],
        'data scientist': ['data', 'scientist', 'machine learning', 'ai', 'intelligence artificielle', 'python', 'r', 'statistique'],
    };

    // Combine all searchable text
    const searchableText = `${name} ${description} ${specialities}`.toLowerCase();

    // Check if any suggested job appears in name, description, address, or specialities
    return normalizedJobs.some(job => {
        // Direct match in any field
        if (name.includes(job) || description.includes(job) || specialities.includes(job) || searchableText.includes(job)) {
            return true;
        }

        // Split job into words and check if any word matches
        const jobWords = job.split(/\s+/).filter(w => w.length > 3); // Ignore short words
        if (jobWords.some(word => searchableText.includes(word))) {
            return true;
        }

        // Check keywords mapping
        for (const [key, keywords] of Object.entries(jobKeywords)) {
            const normalizedKey = normalize(key);
            if (job.includes(normalizedKey) || normalizedKey.includes(job)) {
                return keywords.some(keyword => {
                    const normalizedKeyword = normalize(keyword);
                    return searchableText.includes(normalizedKeyword);
                });
            }
        }

        return false;
    });
}

// 5. Fonction unifiée pour récupérer tous les établissements
export async function fetchAllEstablishments(
    city?: string,
    options: {
        includeHousing?: boolean;
        includeTraining?: boolean;
        includeUniversities?: boolean;
        includeAlternance?: boolean;
        limit?: number;
        suggestedJobs?: string[]; // Métiers suggérés pour filtrer
    } = {}
): Promise<NormalizedResource[]> {
    const {
        includeHousing = true,
        includeTraining = true,
        includeUniversities = true,
        includeAlternance = true,
        limit = 100,
        suggestedJobs,
    } = options;

    const promises: Promise<NormalizedResource[]>[] = [];

    if (includeHousing) {
        promises.push(fetchHousing(city, limit));
    }

    if (includeTraining) {
        promises.push(fetchTrainingCenters(city, limit));
    }

    if (includeUniversities) {
        promises.push(fetchUniversities(city, limit));
    }

    if (includeAlternance) {
        promises.push(fetchAlternanceCenters(city, limit));
    }

    const results = await Promise.all(promises);
    let all = results.flat();

    // Filtrer par métiers suggérés si fournis
    if (suggestedJobs && suggestedJobs.length > 0) {
        // Séparer les logements (toujours affichés) des établissements de formation
        const housingItems = all.filter(item => item.source === 'crous');
        const trainingItems = all.filter(item => item.source !== 'crous');

        // Utiliser d'abord la table de correspondances, puis l'LLM si nécessaire
        if (trainingItems.length > 0) {
            try {
                // 1. Récupérer les mots-clés depuis la BDD pour les métiers suggérés
                const jobKeywordsMap = await getMultipleJobKeywords(suggestedJobs);

                // 2. Séparer les métiers qui ont des mots-clés en cache et ceux qui n'en ont pas
                const jobsWithKeywords: string[] = [];
                const jobsWithoutKeywords: string[] = [];

                for (const job of suggestedJobs) {
                    if (jobKeywordsMap.has(job)) {
                        jobsWithKeywords.push(job);
                    } else {
                        jobsWithoutKeywords.push(job);
                    }
                }

                // 3. Filtrer avec les mots-clés en cache
                let matchedByKeywords: NormalizedResource[] = [];
                if (jobsWithKeywords.length > 0) {
                    // Récupérer tous les mots-clés pour les métiers en cache
                    const allCachedKeywords = new Set<string>();
                    for (const job of jobsWithKeywords) {
                        const keywords = jobKeywordsMap.get(job) || [];
                        keywords.forEach(kw => allCachedKeywords.add(kw));
                    }

                    // Filtrer les établissements qui correspondent aux mots-clés
                    matchedByKeywords = trainingItems.filter(item => {
                        return matchesKeywords(item, Array.from(allCachedKeywords));
                    });
                }

                // 4. Pour les métiers sans mots-clés en cache, utiliser l'LLM
                let matchedByLLM: NormalizedResource[] = [];
                const allMatchResults = new Map<string, boolean>(); // Stocker tous les résultats pour extraction des mots-clés

                if (jobsWithoutKeywords.length > 0) {
                    // Filtrer les établissements qui n'ont pas déjà été matchés par mots-clés
                    const itemsToCheckWithLLM = trainingItems.filter(item =>
                        !matchedByKeywords.some(matched => matched.id === item.id)
                    );

                    if (itemsToCheckWithLLM.length > 0) {
                        const BATCH_SIZE = 20;
                        const llmMatchedItems: NormalizedResource[] = [];

                        // Traiter les établissements par lots
                        for (let i = 0; i < itemsToCheckWithLLM.length; i += BATCH_SIZE) {
                            const batch = itemsToCheckWithLLM.slice(i, i + BATCH_SIZE);

                            const matchResults = await batchMatchEstablishments(
                                batch.map(item => ({
                                    id: item.id,
                                    name: item.name,
                                    description: item.description,
                                    specialities: item.specialities,
                                    address: item.address,
                                })),
                                jobsWithoutKeywords
                            );

                            // Stocker tous les résultats
                            matchResults.forEach((value, key) => {
                                allMatchResults.set(key, value);
                            });

                            // Ajouter les établissements qui correspondent
                            const matched = batch.filter(item =>
                                matchResults.get(item.id) === true
                            );
                            llmMatchedItems.push(...matched);
                        }

                        matchedByLLM = llmMatchedItems;

                        // 5. Extraire les mots-clés des établissements matchés par l'LLM et les sauvegarder
                        // On analyse les établissements matchés pour extraire les mots-clés pertinents
                        for (const job of jobsWithoutKeywords) {
                            // Filtrer les établissements qui correspondent à ce métier spécifique
                            // On utilise une heuristique simple : si l'établissement a été matché par l'LLM
                            // et contient des mots du métier dans son nom/description, on le considère comme pertinent
                            const matchedForJob = matchedByLLM.filter(item => {
                                const normalize = (str: string) => str.toLowerCase()
                                    .normalize('NFD')
                                    .replace(/[\u0300-\u036f]/g, '');
                                const normalizedJob = normalize(job);
                                const normalizedName = normalize(item.name);
                                const normalizedDesc = normalize(item.description || '');
                                const jobWords = normalizedJob.split(/\s+/).filter(w => w.length > 2);

                                // Vérifier si au moins un mot du métier est présent
                                return jobWords.some(word =>
                                    normalizedName.includes(word) || normalizedDesc.includes(word)
                                );
                            });

                            if (matchedForJob.length > 0) {
                                // Extraire les mots-clés communs des établissements matchés
                                const extractedKeywords = extractKeywordsFromEstablishments(matchedForJob, job);

                                // Sauvegarder dans la BDD pour les prochaines fois
                                if (extractedKeywords.length > 0) {
                                    await saveJobKeywords(job, extractedKeywords).catch(err => {
                                        console.error(`Error saving keywords for ${job}:`, err);
                                    });
                                }
                            }
                        }
                    }
                }

                // 6. Combiner les résultats (mots-clés + LLM) et dédupliquer
                const allMatched = [...matchedByKeywords, ...matchedByLLM];
                const uniqueMatched = new Map<string, NormalizedResource>();
                for (const item of allMatched) {
                    if (!uniqueMatched.has(item.id)) {
                        uniqueMatched.set(item.id, item);
                    }
                }

                // 7. Combiner les logements (toujours inclus) avec les établissements filtrés
                all = [...housingItems, ...Array.from(uniqueMatched.values())];
            } catch (error) {
                console.error('Error in filtering establishments:', error);
                // Fallback au matching par mots-clés en cas d'erreur
                all = all.filter(item => {
                    if (item.source === 'crous') {
                        return true;
                    }
                    return matchesSuggestedJobs(item, suggestedJobs);
                });
            }
        } else {
            // Pas d'établissements de formation, garder seulement les logements
            all = housingItems;
        }
    }

    // Dédupliquer par position et nom (éviter les doublons)
    const unique = new Map<string, NormalizedResource>();
    for (const item of all) {
        const key = `${item.position.lat.toFixed(4)}-${item.position.lon.toFixed(4)}-${item.name}`;
        if (!unique.has(key)) {
            unique.set(key, item);
        }
    }

    return Array.from(unique.values()).slice(0, limit);
}
