# Configuration Ollama Cloud

## Étapes pour configurer Ollama Cloud

### 1. Créer un compte et obtenir une clé API

1. Allez sur [https://ollama.com](https://ollama.com)
2. Créez un compte ou connectez-vous
3. Allez dans votre compte → API Keys
4. Générez une nouvelle clé API
5. Copiez la clé API (vous ne pourrez la voir qu'une seule fois)

### 2. Insérer la clé dans Supabase

Exécutez cette requête SQL dans l'éditeur SQL de Supabase :

```sql
INSERT INTO api_keys (service_name, api_key, base_url, model_name)
VALUES ('ollama', 'VOTRE_CLE_API_ICI', 'https://ollama.com', 'gpt-oss:120b')
ON CONFLICT (service_name) DO UPDATE
SET api_key = EXCLUDED.api_key,
    base_url = EXCLUDED.base_url,
    model_name = EXCLUDED.model_name,
    updated_at = NOW();
```

**Important** : Remplacez `'VOTRE_CLE_API_ICI'` par votre vraie clé API Ollama.

### 3. Modèles disponibles

Les modèles cloud disponibles incluent :
- `gpt-oss:120b` (modèle cloud recommandé - note: dans l'API, on utilise sans le suffixe `-cloud`)
- Voir [https://ollama.com/library](https://ollama.com/library) pour la liste complète

**Important** : Dans le CLI, vous utilisez `gpt-oss:120b-cloud`, mais dans l'API, utilisez `gpt-oss:120b` (sans le suffixe `-cloud`).

### 4. Vérification

Pour vérifier que votre configuration fonctionne :

```sql
SELECT
    service_name,
    CASE
        WHEN api_key IS NOT NULL THEN '***' || SUBSTRING(api_key, -4)
        ELSE NULL
    END as api_key_preview,
    base_url,
    model_name
FROM api_keys
WHERE service_name = 'ollama';
```

## Comment ça fonctionne

1. Le service LLM récupère la clé API depuis la base de données
2. Il configure le client OpenAI avec :
   - `baseURL: 'https://ollama.com'`
   - `apiKey: votre_clé_api`
3. Le client ajoute automatiquement l'en-tête `Authorization: Bearer <apiKey>`
4. Les requêtes sont envoyées à `https://ollama.com/v1/chat/completions`

## Dépannage

### Erreur "API Key not found"
- Vérifiez que la clé est bien insérée dans la table `api_keys`
- Vérifiez que `service_name = 'ollama'`

### Erreur "Unauthorized"
- Vérifiez que votre clé API est correcte
- Vérifiez que la clé n'a pas expiré (générez-en une nouvelle si nécessaire)

### Erreur de connexion
- Vérifiez que `base_url = 'https://ollama.com'` (pas localhost)
- Vérifiez votre connexion internet

## Alternative : Variables d'environnement

Vous pouvez aussi utiliser des variables d'environnement dans `server/.env` :

```env
OLLAMA_API_KEY=votre_cle_api
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=gpt-oss:120b
```

La base de données a la priorité, mais les variables d'environnement servent de fallback.
