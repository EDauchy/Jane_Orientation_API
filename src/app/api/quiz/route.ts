 import { NextResponse } from 'next/server';
  import { z } from 'zod';
  import OpenAI from 'openai';
                                                                        
  // ==========================================
  // 1. ZOD SCHEMAS
  // ==========================================
  const resourceBudgetSchema = z.object({
    questionId: z.string(),
    type: z.literal('interactive-sliders'),
    allocations: z.record(z.string(), z.number()),
    totalAllocated: z.number().refine((v) => v === 100, { message:
  'Total must be 100' }),
  });

  const openTextSchema = z.object({
    questionId: z.string(),
    type: z.literal('open-text'),
    response: z.string(),
  });

  const singleChoiceSchema = z.object({
    questionId: z.string(),
    type: z.literal('single-choice'),
    selectedOption: z.string(),
  });

  const valuesRankingSchema = z.object({
    questionId: z.string(),
    type: z.literal('values-ranking'),
    top3: z.array(z.string()).length(3),
    bottom3: z.array(z.string()).length(3),
  });

  const tradeoffSchema = z.object({
    questionId: z.string(),
    type: z.literal('tradeoff'),
    pairId: z.string(),
    choice: z.enum(['A', 'B']),
    regretForOther: z.number().int().min(1).max(5),
  });

  const rankingSchema = z.object({
    questionId: z.string(),
    type: z.literal('ranking'),
    order: z.array(z.string()).min(2),
  });

  const riasecSchema = z.object({
    questionId: z.string(),
    type: z.literal('riasec'),
    responses: z.record(z.string(), z.enum(['like', 'neutral',
  'dislike'])),
  });

  const socialNuanceSchema = z.object({
    questionId: z.string(),
    type: z.literal('social-nuance'),
    sceneId: z.string(),
    interpretations: z.array(z.string()).min(3).max(8),
  });

  const alternativeUsesSchema = z.object({
    questionId: z.string(),
    type: z.literal('alternative-uses'),
    object: z.string(),
    responses: z.array(z.string()),
  });

  const quizAnswerSchema = z.discriminatedUnion('type', [
    resourceBudgetSchema,
    openTextSchema,
    singleChoiceSchema,
    valuesRankingSchema,
    tradeoffSchema,
    rankingSchema,
    riasecSchema,
    socialNuanceSchema,
    alternativeUsesSchema,
  ]);

  const quizSubmissionSchema = z.object({
    sessionId: z.string(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    answers: z.array(quizAnswerSchema),
  });

  // ==========================================
  // 2. CORS HEADERS
  // ==========================================
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS
  });
  }

  // ==========================================
  // 3. POST HANDLER
  // ==========================================
  export async function POST(request: Request) {
    try {
      const body = await request.json();
      const validation = quizSubmissionSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: validation.error.issues },
          { status: 400, headers: CORS_HEADERS },
        );
      }

      const { answers } = validation.data;

      const geminiAnalysis = await analyzeQuizWithGroq(answers);

      const ftToken = await getFranceTravailToken();
      const romeoMetiers = await
  fetchRomeoMetiers(geminiAnalysis.romeQueries, ftToken);

      return NextResponse.json(
        {
          analysis: {
            orientation: geminiAnalysis.orientation,
            keyTraits: geminiAnalysis.keyTraits,
            deducedSkills: geminiAnalysis.deducedSkills,
          },
          romeRecommendations: romeoMetiers,
        },
        { status: 200, headers: CORS_HEADERS },
      );
    } catch (error: any) {
      console.error('Quiz submission error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error', details: error.message },
        { status: 500, headers: CORS_HEADERS },
      );
    }
  }

  // ==========================================
  // 4. LABEL DICTIONARIES (pour Gemini)
  // ==========================================
  const QUESTION_LABELS: Record<string, string> = {
    'qcm-decision': "Quand tu décides, tu t'appuies sur…",
    'qcm-group-role': 'Ton rôle en groupe',
    'qcm-stress': 'Plusieurs imprévus en même temps, première réaction',
    'qcm-satisfaction': 'La satisfaction la plus profonde',
    'qcm-rhythm': 'Classement des rythmes de travail désirables',
    'open-energy': "Tâches qui donnent de l'énergie",
    'open-friction': 'Ce qui vide vite',
    'open-projection': 'Sans contraintes, sur 6 mois, quel rôle tester?',
    'open-blank-page': 'Une journée totalement libre',
    'open-outside-view': "Ce qu'un proche dirait de toi",
    'budget-phases': 'Répartition de 100 jetons sur exploration /execution / finishing',
    'text-memo': 'Mémo libre de fin de quiz',
  };

  const OPTION_LABELS: Record<string, string> = {
    data: 'se fie aux chiffres',
    intuition: "se fie à l'intuition",
    advice: "demande l'avis de proches",
    precedent: 'regarde ce qui a déjà marché',
    test: 'teste en petit avant de trancher',
    leader: 'donne le cap',
    facilitator: 'fait parler tout le monde',
    ideator: 'lance des idées',
    executor: 'exécute',
    analyst: 'pose les vraies questions',
    triage: 'priorise une chose à la fois',
    delegate: "cherche de l'aide",
    freeze: "se fige avant d'agir",
    multitask: "s'éparpille",
    withdraw: 'se coupe et avance seul',
    craft: 'travail bien fait',
    impact: 'avoir aidé concrètement',
    learn: 'avoir appris',
    win: 'avoir gagné',
    create: 'avoir fait exister quelque chose',
    sprint: 'sprints intenses',
    steady: 'rythme régulier',
    waves: 'par vagues',
    flexible: 'totalement flexible',
  };

  function formatAnswers(answers: any[]): string {
    return answers
      .map((a) => {
        const q = QUESTION_LABELS[a.questionId] ?? a.questionId;
        switch (a.type) {
          case 'interactive-sliders':
            return `- ${q} : ${JSON.stringify(a.allocations)}`;
          case 'open-text':
            return `- ${q} :\n  "${a.response}"`;
          case 'single-choice':
            return `- ${q} : ${OPTION_LABELS[a.selectedOption] ??
  a.selectedOption}`;
          case 'values-ranking':
            return `- Valeurs intouchables : ${a.top3.join(', ')} |
  laissables : ${a.bottom3.join(', ')}`;
          case 'tradeoff':
            return `- Dilemme ${a.pairId} : choix ${a.choice}, regret
  pour l'autre ${a.regretForOther}/5`;
          case 'ranking':
            return `- ${q} : ${a.order.join(' > ')}`;
          case 'riasec':
            return `- RIASEC : ${JSON.stringify(a.responses)}`;
          case 'social-nuance':
            return `- Scène "${a.sceneId}" — interprétations :\n
  ${a.interpretations
              .map((i: string) => `• ${i}`)
              .join('\n  ')}`;
          case 'alternative-uses':
            return `- Usages alternatifs de "${a.object}"
  (${a.responses.length}) : ${a.responses.join(', ')}`;
          default:
            return `- ${a.type} submitted`;
        }
      })
      .join('\n');
  }

  // ==========================================
  // 5. GROQ
  // ==========================================
  async function analyzeQuizWithGroq(answers: any[]) {
    const client = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    });

    const answersText = formatAnswers(answers);

    const prompt = `Tu es un conseiller d'orientation expert et un psychologue du travail.
  Analyse les réponses suivantes d'un test d'orientation.

  Réponses :
  ${answersText}

  Tâche :
  1. Déduis l'orientation principale (ex: Créatif, Stratège, Exécutant, Empathique).
  2. Liste 3 à 4 traits de personnalité professionnels dominants.
  3. Déduis 3 savoir-faire ou métiers qui correspondent à ce profil.

  Réponds UNIQUEMENT avec un JSON valide selon ce format exact :
  {
    "orientation": "string",
    "keyTraits": ["trait 1", "trait 2", "trait 3"],
    "deducedSkills": ["skill 1", "skill 2"],
    "romeQueries": [
      { "intitule": "appellation métier ROME France Travail", "contexte": "secteur d'activité" }
    ]
  }

  Contraintes :
  - Exactement 3 objets dans "romeQueries".
  - Les "intitule" DOIVENT être des appellations métiers proches du référentiel ROME France Travail (ex: "Conseil en évolution professionnelle", "Création graphique", "Médiation culturelle"), PAS des descriptions libres.`;

    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const responseText = response.choices[0].message.content!.trim();
    return JSON.parse(responseText);
  }

  // ==========================================
  // 6. FRANCE TRAVAIL (token cache en mémoire)
  // ==========================================
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function getFranceTravailToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
      return cachedToken.value;
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.FRANCE_TRAVAIL_CLIENT_ID!);
    params.append('client_secret',
  process.env.FRANCE_TRAVAIL_CLIENT_SECRET!);
    params.append('scope', 'api_romeov2');

    const response = await fetch(
      'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded'
  },
        body: params.toString(),
      },
    );

    if (!response.ok) throw new Error('Failed to fetch France Travailtoken');
    const data = await response.json();

    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return cachedToken.value;
  }

  async function fetchRomeoMetiers(
    queries: { intitule: string; contexte: string }[],
    token: string,
  ) {
    const appellations = queries.map((q, i) => ({
      identifiant: `query-${i}`,
      intitule: q.intitule,
      contexte: q.contexte,
    }));

    const response = await fetch(

  'https://api.francetravail.io/partenaire/romeo/v2/predictionMetiers',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          appellations,
          options: { nomAppelant: 'Jane', nbResultats: 3,
  seuilScorePrediction: 0.6 },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('ROMEO API Error:', errText);
      throw new Error('Failed to fetch ROME predictions');
    }

    return response.json();
  }
