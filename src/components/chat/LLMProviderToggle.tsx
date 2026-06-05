'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Cloud, Wifi, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface LLMProviderToggleProps {
  onToggle?: (provider: string) => void;
}

export function LLMProviderToggle({ onToggle }: LLMProviderToggleProps) {
  const [provider, setProvider] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setProvidersStatus] = useState<Record<string, any>>({});
  const [groqRateLimit, setGroqRateLimit] = useState(false);

  // Charger la configuration actuelle
  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config/llm-provider');
      const data = await response.json();
      
      // 🔥 NOUVEAU FORMAT - Mise à jour
      setProvider(data.current || 'auto');
      
      // Récupérer les statuts depuis data.providers
      if (data.providers) {
        setProvidersStatus(data.providers);
        
        // Vérifier si GROQ est rate limité
        const groqStatus = data.providers.groq;
        if (groqStatus) {
          setGroqRateLimit(groqStatus.rateLimited === true);
        }
      }
      
      // Compatibilité avec l'ancien format
      if (data.available) {
        setProvidersStatus(prev => ({
          ...prev,
          groq: { available: data.available.groq, configured: !!data.available.groq },
          ollama: { available: true, configured: true }
        }));
      }
      
    } catch (error) {
      console.error('[LLM-TOGGLE] Erreur chargement config:', error);
    }
  };

  // Basculer le provider (cycle complet)
  const toggleProvider = async () => {
    setIsLoading(true);
    
    // 🔥 Cycle complet des providers
    const providers = ['auto', 'groq', 'gemini', 'cerebras', 'openrouter', 'ollama'];
    const currentIndex = providers.indexOf(provider || 'auto');
    const nextProvider = providers[(currentIndex + 1) % providers.length];
    
    try {
      const response = await fetch('/api/config/llm-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: nextProvider })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setProvider(data.current);
        if (onToggle) onToggle(data.current);
        
        // Afficher une notification
        console.log(`[LLM-TOGGLE] ✅ ${data.message}`);
        
        // 🔥 Recharger les statuts
        await loadConfig();
      }
    } catch (error) {
      console.error('[LLM-TOGGLE] Erreur basculement:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Réinitialiser au mode auto
  const resetToAuto = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/config/llm-provider', {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setProvider('auto');
        if (onToggle) onToggle('auto');
        await loadConfig();
        console.log('[LLM-TOGGLE] ✅ Réinitialisé au mode auto');
      }
    } catch (error) {
      console.error('[LLM-TOGGLE] Erreur réinitialisation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  if (!provider) return null;

  // 🔥 Vérifier si GROQ est disponible
  const isGroqRateLimited = groqRateLimit;

  // Déterminer l'icône et le style selon le provider
  const getProviderDisplay = () => {
    switch (provider) {
      case 'auto':
        return { icon: Zap, label: 'AUTO', color: 'purple', tooltip: 'Mode automatique - Le système choisit le meilleur provider' };
      case 'groq':
        return { icon: Cloud, label: 'GROQ', color: 'blue', tooltip: isGroqRateLimited ? 'GROQ (rate limit atteint)' : 'GROQ (cloud, rapide)' };
      case 'gemini':
        return { icon: Cloud, label: 'GEMINI', color: 'blue', tooltip: 'Google Gemini (3k req/jour)' };
      case 'cerebras':
        return { icon: Cloud, label: 'CEREBRAS', color: 'indigo', tooltip: 'Cerebras (ultra-rapide, 14k req/jour)' };
      case 'openrouter':
        return { icon: Cloud, label: 'ROUTER', color: 'cyan', tooltip: 'OpenRouter (50 req/jour)' };
      case 'ollama':
        return { icon: Wifi, label: 'OLLAMA', color: 'green', tooltip: 'Ollama (local, gratuit)' };
      default:
        return { icon: Cloud, label: 'LLM', color: 'gray', tooltip: 'Provider inconnu' };
    }
  };

  const display = getProviderDisplay();
  const IconComponent = display.icon;
  const isActive = provider !== 'auto';

  // Couleurs selon le provider
  const getColorClasses = () => {
    if (provider === 'auto') return 'bg-purple-600/20 border-purple-500/50 hover:bg-purple-600/30';
    if (provider === 'groq' && isGroqRateLimited) return 'bg-red-600/20 border-red-500/50 hover:bg-red-600/30';
    if (provider === 'groq') return 'bg-blue-600/20 border-blue-500/50 hover:bg-blue-600/30';
    if (provider === 'gemini') return 'bg-blue-600/20 border-blue-500/50 hover:bg-blue-600/30';
    if (provider === 'cerebras') return 'bg-indigo-600/20 border-indigo-500/50 hover:bg-indigo-600/30';
    if (provider === 'openrouter') return 'bg-cyan-600/20 border-cyan-500/50 hover:bg-cyan-600/30';
    if (provider === 'ollama') return 'bg-green-600/20 border-green-500/50 hover:bg-green-600/30';
    return 'bg-gray-600/20 border-gray-500/50 hover:bg-gray-600/30';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <Button
              onClick={toggleProvider}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className={cn(
                "relative overflow-hidden transition-all duration-300",
                getColorClasses()
              )}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <IconComponent className={cn(
                    "w-4 h-4 mr-2",
                    provider === 'auto' && "text-purple-400",
                    provider === 'groq' && (isGroqRateLimited ? "text-red-400" : "text-blue-400"),
                    provider === 'gemini' && "text-blue-400",
                    provider === 'cerebras' && "text-indigo-400",
                    provider === 'openrouter' && "text-cyan-400",
                    provider === 'ollama' && "text-green-400"
                  )} />
                  <span className="text-xs font-medium">{display.label}</span>
                  
                  {/* Indicateur de rate limit GROQ */}
                  {provider === 'groq' && isGroqRateLimited && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                  
                  {/* Indicateur mode auto */}
                  {provider === 'auto' && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  )}
                </>
              )}
            </Button>
            
            {/* Bouton reset si mode forcé */}
            {isActive && (
              <button
                onClick={resetToAuto}
                className="text-xs text-gray-400 hover:text-white transition-colors px-1"
                title="Revenir au mode automatique"
              >
                ↺
              </button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{display.tooltip}</p>
          {provider === 'auto' && <p className="text-xs text-gray-400 mt-1">Cliquer pour changer de provider</p>}
          {isActive && <p className="text-xs text-gray-400 mt-1">Cliquer pour changer • ↺ pour réinitialiser</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}