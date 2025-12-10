import { supabaseAdmin } from '@/lib/supabase';

export async function getApiKey(serviceName: string): Promise<string | null> {
    // 1. Try DB
    try {
        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .select('api_key')
            .eq('service_name', serviceName)
            .single();

        if (data && data.api_key) {
            return data.api_key;
        }
    } catch (e) {
        // Ignore DB error, fall back to env
        console.warn(`Failed to fetch API key for ${serviceName} from DB, falling back to env.`);
    }

    // 2. Fallback to Env
    if (serviceName === 'openai') return process.env.OPENAI_API_KEY || null;
    if (serviceName === 'ollama') return process.env.OLLAMA_API_KEY || null; // Ollama Cloud requires a real API key

    return null;
}

// Get base URL for a service (useful for Ollama)
export async function getServiceBaseUrl(serviceName: string): Promise<string | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .select('base_url')
            .eq('service_name', serviceName)
            .single();

        if (data && data.base_url) {
            return data.base_url;
        }
    } catch (e) {
        // Ignore DB error, fall back to env
    }

    // Fallback to Env
    // Ollama Cloud uses https://ollama.com, local uses http://localhost:11434/v1
    if (serviceName === 'ollama') return process.env.OLLAMA_BASE_URL || 'https://ollama.com';
    if (serviceName === 'openai') return process.env.OPENAI_BASE_URL || null;

    return null;
}

// Get model name for a service
export async function getServiceModel(serviceName: string): Promise<string | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .select('model_name')
            .eq('service_name', serviceName)
            .single();

        if (data && data.model_name) {
            return data.model_name;
        }
    } catch (e) {
        // Ignore DB error, fall back to env
    }

    // Fallback to Env
    // For Ollama Cloud, default model is 'gpt-oss:120b' (without -cloud suffix in API)
    if (serviceName === 'ollama') return process.env.OLLAMA_MODEL || 'gpt-oss:120b';
    if (serviceName === 'openai') return process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

    return null;
}
