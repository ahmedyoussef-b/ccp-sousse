// src/app/api/config/llm-provider/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Chemin du fichier de configuration dynamique
const CONFIG_PATH = path.join(process.cwd(), '.env.llm');

// 🔥 Liste de tous les providers disponibles
type LLMProvider = 'auto' | 'groq' | 'gemini' | 'cerebras' | 'openrouter' | 'claude-local' | 'ollama' | 'hybrid';

const ALL_PROVIDERS: LLMProvider[] = ['auto', 'groq', 'gemini', 'cerebras', 'openrouter', 'claude-local', 'ollama', 'hybrid'];

// 🔥 Configuration des providers (disponibilité)
interface ProviderConfig {
  checkAvailable: () => boolean;
  quota: string;
}

const PROVIDER_CONFIG: Record<LLMProvider, ProviderConfig> = {
  auto: { checkAvailable: () => true, quota: 'Automatique' },
  groq: { checkAvailable: () => !!process.env.GROQ_API_KEY, quota: '100k tokens/jour' },
  gemini: { checkAvailable: () => !!process.env.GEMINI_API_KEY, quota: '3k req/jour' },
  cerebras: { checkAvailable: () => !!process.env.CEREBRAS_API_KEY, quota: '14.4k req/jour' },
  openrouter: { checkAvailable: () => !!process.env.OPENROUTER_API_KEY, quota: '50 req/jour' },
  'claude-local': { checkAvailable: () => true, quota: 'Illimité (local)' },
  ollama: { checkAvailable: () => true, quota: 'Illimité (local)' },
  hybrid: { checkAvailable: () => true, quota: 'Illimité (local)' }
};

// 🔥 Messages pour chaque provider
const PROVIDER_MESSAGES: Record<LLMProvider, string> = {
  auto: 'Mode automatique activé - Le système choisira le meilleur provider',
  groq: 'GROQ activé (rapide, quota: 100k tokens/jour)',
  gemini: 'Google Gemini activé (3k req/jour gratuites)',
  cerebras: 'Cerebras activé (ultra-rapide, 14.4k req/jour)',
  openrouter: 'OpenRouter activé (50 req/jour, 20+ modèles)',
  'claude-local': 'Claude Local activé (100% gratuit, hors-ligne)',
  ollama: 'Ollama activé (100% gratuit, hors-ligne)',
  hybrid: 'Mode hybride activé (RAG local)'
};

// 🔥 Interface pour le statut d'un provider
interface ProviderStatus {
  available: boolean;
  configured: boolean;
  quota: string;
  rateLimited?: boolean;
  resetInMs?: number | null;
}

// Lire la configuration actuelle
function getCurrentProvider(): LLMProvider {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const match = content.match(/LLM_PROVIDER=(\w+(?:-\w+)?)/);
      if (match && ALL_PROVIDERS.includes(match[1] as LLMProvider)) {
        return match[1] as LLMProvider;
      }
    }
  } catch (e) {}
  
  // Valeur par défaut depuis process.env
  if (process.env.LLM_ROUTER_FORCE_PROVIDER) {
    return process.env.LLM_ROUTER_FORCE_PROVIDER as LLMProvider;
  }
  return process.env.USE_GROQ === 'true' ? 'groq' : 'auto';
}

// Sauvegarder la configuration
function setCurrentProvider(provider: LLMProvider): void {
  fs.writeFileSync(CONFIG_PATH, `LLM_PROVIDER=${provider}\nUPDATED_AT=${Date.now()}`);
}

// 🔥 Vérifier le rate limit GROQ
async function checkGroqRateLimit(): Promise<{ available: boolean; remaining: number | null; resetInMs: number | null }> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
    });
    
    if (response.status === 429) {
      const data = await response.json();
      // Extraire le temps d'attente du message d'erreur
      const match = data.error?.message?.match(/try again in (\d+(?:\.\d+)?)m(\d+(?:\.\d+)?)?s?/);
      let resetInMs = null;
      if (match) {
        const minutes = parseFloat(match[1]) || 0;
        const seconds = parseFloat(match[2]) || 0;
        resetInMs = (minutes * 60 + seconds) * 1000;
      }
      return { available: false, remaining: null, resetInMs };
    }
    
    return { available: true, remaining: null, resetInMs: null };
  } catch (error) {
    return { available: false, remaining: null, resetInMs: null };
  }
}

// 🔥 Vérifier la disponibilité de tous les providers
async function getAllProvidersStatus(): Promise<Record<string, ProviderStatus>> {
  const status: Record<string, ProviderStatus> = {};
  
  for (const provider of ALL_PROVIDERS) {
    const config = PROVIDER_CONFIG[provider];
    const configured = config.checkAvailable();
    status[provider] = {
      available: provider === 'auto' ? true : configured,
      configured,
      quota: config.quota
    };
  }
  
  // Ajouter le statut spécifique GROQ (rate limit)
  const groqStatus = status['groq'];
  if (groqStatus && groqStatus.configured) {
    const rateLimit = await checkGroqRateLimit();
    status['groq'] = {
      ...groqStatus,
      available: rateLimit.available,
      rateLimited: !rateLimit.available,
      resetInMs: rateLimit.resetInMs
    };
  }
  
  return status;
}

// ============================================
// GET - Récupérer la configuration actuelle
// ============================================
export async function GET() {
  try {
    const current = getCurrentProvider();
    const providersStatus = await getAllProvidersStatus();
    const isRouterEnabled = process.env.LLM_ROUTER_ENABLED !== 'false';
    
    return NextResponse.json({
      current,
      routerEnabled: isRouterEnabled,
      providers: providersStatus,
      fallbackOrder: ['groq', 'gemini', 'cerebras', 'openrouter', 'claude-local', 'ollama', 'hybrid'],
      config: {
        preferLocal: process.env.LLM_ROUTER_PREFER_LOCAL === 'true',
        cacheEnabled: process.env.LLM_ROUTER_CACHE_ENABLED !== 'false'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// POST - Basculer vers un provider
// ============================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = body.provider as LLMProvider;
    const preferLocal = body.preferLocal as boolean | undefined;
    const cacheEnabled = body.cacheEnabled as boolean | undefined;
    
    // Validation du provider
    if (!provider || !ALL_PROVIDERS.includes(provider)) {
      return NextResponse.json({ 
        error: `Provider invalide. Choisir parmi: ${ALL_PROVIDERS.join(', ')}` 
      }, { status: 400 });
    }
    
    // Vérifier que le provider est configuré (sauf auto et locaux)
    if (provider !== 'auto' && provider !== 'claude-local' && provider !== 'ollama' && provider !== 'hybrid') {
      const config = PROVIDER_CONFIG[provider];
      const isConfigured = config?.checkAvailable();
      if (!isConfigured) {
        return NextResponse.json({ 
          error: `Provider ${provider} non configuré. Vérifiez la clé API dans .env.local` 
        }, { status: 400 });
      }
    }
    
    // Sauvegarder le provider
    setCurrentProvider(provider);
    
    // Sauvegarder les préférences supplémentaires si fournies
    if (preferLocal !== undefined || cacheEnabled !== undefined) {
      const envContent: string[] = [];
      if (preferLocal !== undefined) envContent.push(`LLM_ROUTER_PREFER_LOCAL=${preferLocal}`);
      if (cacheEnabled !== undefined) envContent.push(`LLM_ROUTER_CACHE_ENABLED=${cacheEnabled}`);
      
      if (envContent.length > 0) {
        const envPath = path.join(process.cwd(), '.env.local');
        try {
          let currentEnv = fs.readFileSync(envPath, 'utf-8');
          for (const line of envContent) {
            const key = line.split('=')[0];
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(currentEnv)) {
              currentEnv = currentEnv.replace(regex, line);
            } else {
              currentEnv += `\n${line}`;
            }
          }
          fs.writeFileSync(envPath, currentEnv, 'utf-8');
        } catch (e) {
          console.warn('[LLM-CONFIG] Impossible de mettre à jour .env.local');
        }
      }
    }
    
    console.log(`[LLM-CONFIG] 🔄 Basculement vers ${provider.toUpperCase()}`);
    
    // Utiliser le message depuis PROVIDER_MESSAGES
    const message = PROVIDER_MESSAGES[provider];
    
    return NextResponse.json({ 
      success: true, 
      current: provider,
      message,
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[LLM-CONFIG] Erreur:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// DELETE - Réinitialiser la configuration
// ============================================
export async function DELETE() {
  try {
    // Réinitialiser à 'auto'
    setCurrentProvider('auto');
    console.log(`[LLM-CONFIG] 🔄 Réinitialisation à AUTO`);
    
    return NextResponse.json({ 
      success: true, 
      current: 'auto',
      message: 'Configuration réinitialisée (mode automatique)'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}