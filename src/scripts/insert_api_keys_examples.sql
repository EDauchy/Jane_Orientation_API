-- ============================================
-- REQUÊTES SQL POUR INSÉRER DES CLÉS API
-- ============================================
-- Exécutez ces requêtes dans l'éditeur SQL de Supabase
-- Remplacez les valeurs entre guillemets par vos vraies clés

-- ============================================
-- 1. INSÉRER UNE CLÉ OLLAMA CLOUD
-- ============================================
-- Pour utiliser Ollama Cloud (recommandé)
-- 1. Créez un compte sur https://ollama.com
-- 2. Générez une clé API depuis votre compte
-- 3. Exécutez cette requête avec votre vraie clé API

INSERT INTO api_keys (service_name, api_key, base_url, model_name)
VALUES ('ollama', 'votre-cle-api-ollama-ici', 'https://ollama.com', 'gpt-oss:120b')
ON CONFLICT (service_name) DO UPDATE
SET api_key = EXCLUDED.api_key,
    base_url = EXCLUDED.base_url,
    model_name = EXCLUDED.model_name,
    updated_at = NOW();

-- Note:
-- - Remplacez 'votre-cle-api-ollama-ici' par votre vraie clé API Ollama
-- - base_url doit être 'https://ollama.com' pour Ollama Cloud
-- - Modèles cloud disponibles: 'gpt-oss:120b-cloud', etc. (voir https://ollama.com/library)
-- - Pour obtenir votre clé API: https://ollama.com → Account → API Keys

-- ============================================
-- 1b. INSÉRER UNE CLÉ OLLAMA LOCAL (alternative)
-- ============================================
-- Si vous préférez utiliser Ollama en local au lieu du cloud:
-- INSERT INTO api_keys (service_name, api_key, base_url, model_name)
-- VALUES ('ollama', 'ollama', 'http://localhost:11434/v1', 'llama3')
-- ON CONFLICT (service_name) DO UPDATE
-- SET api_key = EXCLUDED.api_key,
--     base_url = EXCLUDED.base_url,
--     model_name = EXCLUDED.model_name,
--     updated_at = NOW();

-- ============================================
-- 2. INSÉRER UNE CLÉ OPENAI
-- ============================================
INSERT INTO api_keys (service_name, api_key, base_url, model_name)
VALUES ('openai', 'sk-votre-cle-api-openai-ici', NULL, 'gpt-3.5-turbo')
ON CONFLICT (service_name) DO UPDATE
SET api_key = EXCLUDED.api_key,
    base_url = EXCLUDED.base_url,
    model_name = EXCLUDED.model_name,
    updated_at = NOW();

-- Note: base_url peut être NULL pour OpenAI (utilise l'URL par défaut)
-- Modèles possibles: 'gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', etc.

-- ============================================
-- 3. INSÉRER UNE CLÉ OPENROUTESERVICE
-- ============================================
INSERT INTO api_keys (service_name, api_key, base_url, model_name)
VALUES ('openrouteservice', 'votre-cle-ors-ici', NULL, NULL)
ON CONFLICT (service_name) DO UPDATE
SET api_key = EXCLUDED.api_key,
    base_url = EXCLUDED.base_url,
    model_name = EXCLUDED.model_name,
    updated_at = NOW();

-- ============================================
-- 4. INSÉRER UNE CLÉ NAVITIA
-- ============================================
INSERT INTO api_keys (service_name, api_key, base_url, model_name)
VALUES ('navitia', 'votre-cle-navitia-ici', NULL, NULL)
ON CONFLICT (service_name) DO UPDATE
SET api_key = EXCLUDED.api_key,
    base_url = EXCLUDED.base_url,
    model_name = EXCLUDED.model_name,
    updated_at = NOW();

-- ============================================
-- 5. MISE À JOUR D'UNE CLÉ EXISTANTE
-- ============================================
-- Pour mettre à jour uniquement la clé API d'un service existant :
UPDATE api_keys
SET api_key = 'nouvelle-cle-ici',
    updated_at = NOW()
WHERE service_name = 'ollama';

-- ============================================
-- 6. MISE À JOUR DU MODÈLE OLLAMA
-- ============================================
UPDATE api_keys
SET model_name = 'mistral',
    updated_at = NOW()
WHERE service_name = 'ollama';

-- ============================================
-- 7. MISE À JOUR DE L'URL OLLAMA
-- ============================================
UPDATE api_keys
SET base_url = 'http://192.168.1.100:11434/v1',
    updated_at = NOW()
WHERE service_name = 'ollama';

-- ============================================
-- 8. VOIR TOUTES LES CLÉS API (sans afficher les clés)
-- ============================================
SELECT
    service_name,
    CASE
        WHEN api_key IS NOT NULL THEN '***' || SUBSTRING(api_key, -4)
        ELSE NULL
    END as api_key_preview,
    base_url,
    model_name,
    created_at,
    updated_at
FROM api_keys
ORDER BY service_name;

-- ============================================
-- 9. SUPPRIMER UNE CLÉ API
-- ============================================
-- ATTENTION: Cette action est irréversible !
-- DELETE FROM api_keys WHERE service_name = 'ollama';

-- ============================================
-- 10. INSÉRER PLUSIEURS CLÉS EN UNE FOIS
-- ============================================
INSERT INTO api_keys (service_name, api_key, base_url, model_name)
VALUES
    ('ollama', 'ollama', 'http://localhost:11434/v1', 'llama3'),
    ('openai', 'sk-votre-cle-openai', NULL, 'gpt-3.5-turbo')
ON CONFLICT (service_name) DO UPDATE
SET api_key = EXCLUDED.api_key,
    base_url = EXCLUDED.base_url,
    model_name = EXCLUDED.model_name,
    updated_at = NOW();
