import OpenAI from 'openai';
import { Ollama } from 'ollama';
import { getApiKey, getServiceBaseUrl, getServiceModel } from './apiKeyService';

const PROMPT_TEMPLATE = `
Contexte :
Tu incarnes le conseiller en orientation professionnelle par excellence, doté d'une compréhension approfondie de la nature humaine et de la psychologie. En tant qu'expert du MBTI, tu analyses avec une précision inégalée les traits de personnalité, sans aucun préjugé ni stéréotype, en t'appuyant sur les recherches les plus récentes. Ta neutralité et ta rigueur analytiques garantissent des conseils personnalisés et pertinents.

Objectif :
Analyser un formulaire complet (comprenant les questions posées et les réponses fournies par l'utilisateur) afin d'identifier les domaines de prédilection professionnelle et de recommander une liste de métiers. La réponse finale doit être fournie strictement sous forme de JSON, avec une clé unique (par exemple "metiers") associée à un tableau contenant des chaînes de caractères, chacune représentant un métier. Le tableau doit contenir au maximum 4 métiers.

Instructions pour le traitement du formulaire :
- Analyse minutieuse de chaque réponse du formulaire en te basant sur les principes du MBTI et les dernières avancées en psychologie.
- Identification claire des valeurs, motivations, compétences et aspirations de l'utilisateur.
- Sélection des métiers les plus adaptés à la personnalité et aux réponses fournies.
- La réponse finale doit être un objet JSON avec une seule clé ("metiers") dont la valeur est un tableau de chaînes de caractères.
- Assure-toi que le tableau contient au maximum 4 éléments, chaque élément étant une chaîne de caractères représentant un métier, sans données supplémentaires ni texte additionnel.

Système de gestion des erreurs et d'auto-évaluation :
- Avant de finaliser ta réponse, effectue une auto-évaluation pour confirmer que :
  1. Le tableau associé à la clé "metiers" contient au maximum 4 métiers.
  2. Chaque métier est représenté uniquement par une chaîne de caractères.
  3. Aucune donnée additionnelle n’est présente dans le JSON.
- Si l'auto-évaluation détecte un manquement au format exigé, corrige immédiatement la réponse pour qu'elle respecte strictement le format demandé.

Exemple de réponse attendue :
{
  "metiers": ["Développeur Front-End", "UI/UX Designer"]
}

Voici le formulaire complet avec les questions et les réponses :
`;

export async function getJobSuggestions(answers: Record<string, string>) {
    // Try to get Ollama first, then fallback to OpenAI
    let serviceName = 'ollama';
    let apiKey = await getApiKey('ollama');
    let baseURL = await getServiceBaseUrl('ollama');
    let model = await getServiceModel('ollama');

    // If Ollama is not configured, use OpenAI
    if (!apiKey) {
        serviceName = 'openai';
        apiKey = await getApiKey('openai');
        baseURL = await getServiceBaseUrl('openai') || null;
        model = await getServiceModel('openai') || 'gpt-3.5-turbo';
    }

    if (!apiKey) {
        throw new Error(`API Key not found. Veuillez configurer une clé API Ollama ou OpenAI dans la base de données ou les variables d'environnement.`);
    }

    // Construct the full prompt with formatted questions and answers
    let formContent = '';
    let questionIndex = 1;
    for (const [questionId, answer] of Object.entries(answers)) {
        if (answer && answer.trim()) {
            formContent += `Question ${questionIndex} (${questionId}):\n${answer}\n\n`;
            questionIndex++;
        }
    }

    const fullPrompt = `${PROMPT_TEMPLATE}\n${formContent}\n\nIMPORTANT: Réponds UNIQUEMENT avec un objet JSON valide contenant la clé "metiers" et un tableau de 1 à 4 métiers en français.`;

    let content: string;

    // Use Ollama Cloud API with official SDK
    if (serviceName === 'ollama' && baseURL?.includes('ollama.com')) {
        // Use official Ollama SDK for Cloud API
        const ollama = new Ollama({
            host: baseURL,
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });

        try {
            const response = await ollama.chat({
                model: model || 'gpt-oss:120b', // Ollama Cloud model (without -cloud suffix in API)
                messages: [
                    {
                        role: 'user',
                        content: fullPrompt,
                    },
                ],
                stream: false,
            });

            content = response.message.content || '';

            if (!content) {
                throw new Error('No content in Ollama response');
            }
        } catch (error: any) {
            console.error('Ollama API error:', error);
            throw new Error(`Ollama API error: ${error.message || 'Unknown error'}`);
        }
    } else {
        // Use OpenAI client for OpenAI or local Ollama (if compatible)
        const clientConfig: any = {
            apiKey: apiKey,
        };

        if (baseURL) {
            clientConfig.baseURL = baseURL;
        }

        const openai = new OpenAI(clientConfig);

        // Prepare completion options
        const completionOptions: any = {
            messages: [{ role: 'user', content: fullPrompt }],
            model: model || 'gpt-3.5-turbo',
            temperature: 0.7,
        };

        // Only add response_format for OpenAI
        if (serviceName === 'openai') {
            completionOptions.response_format = { type: "json_object" };
        }

        const completion = await openai.chat.completions.create(completionOptions);
        content = completion.choices[0].message.content || '';

        if (!content) {
            throw new Error('No content in LLM response');
        }
    }

    try {
        // Try to parse JSON - handle cases where LLM might add markdown code blocks
        let jsonContent = content.trim();

        // Remove markdown code blocks if present
        if (jsonContent.startsWith('```')) {
            const lines = jsonContent.split('\n');
            jsonContent = lines.slice(1, -1).join('\n').trim();
        }

        // Remove any leading/trailing whitespace or newlines
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

        const json = JSON.parse(jsonContent);

        // Validate the response structure
        if (!json.metiers || !Array.isArray(json.metiers)) {
            console.error('Invalid response structure:', json);
            throw new Error('La réponse de l\'IA n\'a pas le format attendu');
        }

        // Filter out empty strings and limit to 4 results
        const metiers = json.metiers
            .filter((m: any) => m && typeof m === 'string' && m.trim().length > 0)
            .slice(0, 4)
            .map((m: string) => m.trim());

        if (metiers.length === 0) {
            throw new Error('Aucun métier valide trouvé dans la réponse de l\'IA');
        }

        return metiers;
    } catch (e: any) {
        console.error('Failed to parse LLM response:', content);
        console.error('Parse error:', e);
        throw new Error('Erreur lors de l\'analyse de la réponse de l\'IA: ' + (e.message || 'Format invalide'));
    }
}

/**
 * Utilise l'LLM pour déterminer si plusieurs établissements forment aux métiers suggérés (batch processing)
 * @param establishments Liste des établissements à vérifier
 * @param suggestedJobs Liste des métiers suggérés par l'IA
 * @returns Map avec l'ID de l'établissement comme clé et un booléen comme valeur
 */
export async function batchMatchEstablishments(
    establishments: Array<{
        id: string;
        name: string;
        description?: string;
        specialities?: string[];
        address?: string;
    }>,
    suggestedJobs: string[]
): Promise<Map<string, boolean>> {
    if (!suggestedJobs || suggestedJobs.length === 0) {
        // Pas de filtre, tous les établissements sont inclus
        return new Map(establishments.map(e => [e.id, true]));
    }

    if (establishments.length === 0) {
        return new Map();
    }

    // Try to get Ollama first, then fallback to OpenAI
    let serviceName = 'ollama';
    let apiKey = await getApiKey('ollama');
    let baseURL = await getServiceBaseUrl('ollama');
    let model = await getServiceModel('ollama');

    // If Ollama is not configured, use OpenAI
    if (!apiKey) {
        serviceName = 'openai';
        apiKey = await getApiKey('openai');
        baseURL = await getServiceBaseUrl('openai') || null;
        model = await getServiceModel('openai') || 'gpt-3.5-turbo';
    }

    if (!apiKey) {
        // Fallback to simple keyword matching if no LLM available
        console.warn('No LLM API key found, falling back to keyword matching');
        const result = new Map<string, boolean>();
        for (const establishment of establishments) {
            result.set(establishment.id, matchesByKeywords(establishment, suggestedJobs));
        }
        return result;
    }

    // Construire le prompt avec tous les établissements
    const establishmentsList = establishments.map((est, index) => {
        return `ÉTABLISSEMENT ${index + 1} (ID: ${est.id}):
- Nom: ${est.name}
- Description: ${est.description || 'Non disponible'}
- Spécialités: ${est.specialities?.join(', ') || 'Non disponible'}
- Adresse: ${est.address || 'Non disponible'}`;
    }).join('\n\n');

    const prompt = `Tu es un expert en orientation professionnelle et en formation.

Analyse si chaque établissement suivant forme aux métiers suggérés.

MÉTIERS SUGGÉRÉS:
${suggestedJobs.map((job, i) => `${i + 1}. ${job}`).join('\n')}

ÉTABLISSEMENTS:
${establishmentsList}

Réponds UNIQUEMENT avec un objet JSON valide contenant une clé pour chaque ID d'établissement avec la valeur true ou false.
Si un établissement forme (même partiellement) à au moins un des métiers suggérés, réponds true. Sinon, réponds false.

Exemple de réponse attendue:
{
  "id1": true,
  "id2": false,
  "id3": true
}

Réponse:`;

    let content: string;

    try {
        // Use Ollama Cloud API with official SDK
        if (serviceName === 'ollama' && baseURL?.includes('ollama.com')) {
            const ollama = new Ollama({
                host: baseURL,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            });

            const response = await ollama.chat({
                model: model || 'gpt-oss:120b',
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                stream: false,
            });

            content = response.message.content || '';
        } else {
            // Use OpenAI client
            const clientConfig: any = {
                apiKey: apiKey,
            };

            if (baseURL) {
                clientConfig.baseURL = baseURL;
            }

            const openai = new OpenAI(clientConfig);

            const completionOptions: any = {
                messages: [{ role: 'user', content: prompt }],
                model: model || 'gpt-3.5-turbo',
                temperature: 0.3, // Lower temperature for more consistent matching
            };

            if (serviceName === 'openai') {
                completionOptions.response_format = { type: "json_object" };
            }

            const completion = await openai.chat.completions.create(completionOptions);
            content = completion.choices[0].message.content || '';
        }

        if (!content) {
            throw new Error('No content in LLM response');
        }

        // Parse JSON response
        let jsonContent = content.trim();
        if (jsonContent.startsWith('```')) {
            const lines = jsonContent.split('\n');
            jsonContent = lines.slice(1, -1).join('\n').trim();
        }
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

        const json = JSON.parse(jsonContent);
        const result = new Map<string, boolean>();

        // Extraire les résultats pour chaque établissement
        for (const establishment of establishments) {
            const match = json[establishment.id] === true;
            result.set(establishment.id, match);
        }

        return result;

    } catch (error: any) {
        console.error('LLM batch matching error, falling back to keyword matching:', error);
        // Fallback to keyword matching on error
        const result = new Map<string, boolean>();
        for (const establishment of establishments) {
            result.set(establishment.id, matchesByKeywords(establishment, suggestedJobs));
        }
        return result;
    }
}

/**
 * Utilise l'LLM pour déterminer si un établissement forme aux métiers suggérés
 * @param establishment Informations sur l'établissement
 * @param suggestedJobs Liste des métiers suggérés par l'IA
 * @returns true si l'établissement forme aux métiers suggérés, false sinon
 */
export async function doesEstablishmentMatchJobs(
    establishment: {
        name: string;
        description?: string;
        specialities?: string[];
        address?: string;
    },
    suggestedJobs: string[]
): Promise<boolean> {
    if (!suggestedJobs || suggestedJobs.length === 0) {
        return true; // Pas de filtre, afficher tout
    }

    // Try to get Ollama first, then fallback to OpenAI
    let serviceName = 'ollama';
    let apiKey = await getApiKey('ollama');
    let baseURL = await getServiceBaseUrl('ollama');
    let model = await getServiceModel('ollama');

    // If Ollama is not configured, use OpenAI
    if (!apiKey) {
        serviceName = 'openai';
        apiKey = await getApiKey('openai');
        baseURL = await getServiceBaseUrl('openai') || null;
        model = await getServiceModel('openai') || 'gpt-3.5-turbo';
    }

    if (!apiKey) {
        // Fallback to simple keyword matching if no LLM available
        console.warn('No LLM API key found, falling back to keyword matching');
        return matchesByKeywords(establishment, suggestedJobs);
    }

    const prompt = `Tu es un expert en orientation professionnelle et en formation.

Analyse si l'établissement suivant forme aux métiers suggérés.

ÉTABLISSEMENT:
- Nom: ${establishment.name}
- Description: ${establishment.description || 'Non disponible'}
- Spécialités: ${establishment.specialities?.join(', ') || 'Non disponible'}
- Adresse: ${establishment.address || 'Non disponible'}

MÉTIERS SUGGÉRÉS:
${suggestedJobs.map((job, i) => `${i + 1}. ${job}`).join('\n')}

Réponds UNIQUEMENT avec un objet JSON valide contenant une clé "match" avec la valeur true ou false.
Si l'établissement forme (même partiellement) à au moins un des métiers suggérés, réponds true. Sinon, réponds false.

Exemple de réponse attendue:
{"match": true}

Réponse:`;

    let content: string;

    try {
        // Use Ollama Cloud API with official SDK
        if (serviceName === 'ollama' && baseURL?.includes('ollama.com')) {
            const ollama = new Ollama({
                host: baseURL,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            });

            const response = await ollama.chat({
                model: model || 'gpt-oss:120b',
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                stream: false,
            });

            content = response.message.content || '';
        } else {
            // Use OpenAI client
            const clientConfig: any = {
                apiKey: apiKey,
            };

            if (baseURL) {
                clientConfig.baseURL = baseURL;
            }

            const openai = new OpenAI(clientConfig);

            const completionOptions: any = {
                messages: [{ role: 'user', content: prompt }],
                model: model || 'gpt-3.5-turbo',
                temperature: 0.3, // Lower temperature for more consistent matching
            };

            if (serviceName === 'openai') {
                completionOptions.response_format = { type: "json_object" };
            }

            const completion = await openai.chat.completions.create(completionOptions);
            content = completion.choices[0].message.content || '';
        }

        if (!content) {
            throw new Error('No content in LLM response');
        }

        // Parse JSON response
        let jsonContent = content.trim();
        if (jsonContent.startsWith('```')) {
            const lines = jsonContent.split('\n');
            jsonContent = lines.slice(1, -1).join('\n').trim();
        }
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

        const json = JSON.parse(jsonContent);
        return json.match === true;

    } catch (error: any) {
        console.error('LLM matching error, falling back to keyword matching:', error);
        // Fallback to keyword matching on error
        return matchesByKeywords(establishment, suggestedJobs);
    }
}

/**
 * Fallback function for keyword-based matching when LLM is not available
 */
function matchesByKeywords(
    establishment: {
        name: string;
        description?: string;
        specialities?: string[];
    },
    suggestedJobs: string[]
): boolean {
    const normalize = (str: string) => str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    const normalizedJobs = suggestedJobs.map(normalize);
    const name = normalize(establishment.name);
    const description = normalize(establishment.description || '');
    const specialities = (establishment.specialities || []).map(normalize).join(' ');
    const searchableText = `${name} ${description} ${specialities}`;

    return normalizedJobs.some(job => {
        const jobWords = job.split(/\s+/).filter(w => w.length > 3);
        return jobWords.some(word => searchableText.includes(word));
    });
}
