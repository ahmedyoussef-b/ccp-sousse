'use client';

import { useEffect, useState } from 'react';
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GroqUsageIndicatorProps {
  className?: string;
  compact?: boolean;
}

// Limites de Groq (gratuit)
const DAILY_LIMIT = 14400;      // 14 400 requêtes/jour
const MINUTE_LIMIT = 30;         // 30 requêtes/minute
const TOKEN_DAILY_LIMIT = 500000; // 500 000 tokens/jour

export function GroqUsageIndicator({ className, compact = false }: GroqUsageIndicatorProps) {
  const [usage, setUsage] = useState<{
    dailyRequests: number;
    minuteRequests: number;
    dailyTokens: number;
    isConnected: boolean;
    lastUpdated: Date | null;
  }>({
    dailyRequests: 0,
    minuteRequests: 0,
    dailyTokens: 0,
    isConnected: false,
    lastUpdated: null
  });

  // Simulation de l'utilisation (à remplacer par un vrai compteur via API)
  useEffect(() => {
    // Récupérer depuis localStorage ou une API
    const stored = localStorage.getItem('groq_usage');
    if (stored) {
      const data = JSON.parse(stored);
      // Réinitialiser si la date a changé
      const today = new Date().toDateString();
      if (data.date !== today) {
        localStorage.setItem('groq_usage', JSON.stringify({
          dailyRequests: 0,
          minuteRequests: 0,
          dailyTokens: 0,
          date: today
        }));
        setUsage(prev => ({ ...prev, dailyRequests: 0, minuteRequests: 0, dailyTokens: 0 }));
      } else {
        setUsage(prev => ({ ...prev, ...data }));
      }
    } else {
      localStorage.setItem('groq_usage', JSON.stringify({
        dailyRequests: 0,
        minuteRequests: 0,
        dailyTokens: 0,
        date: new Date().toDateString()
      }));
    }

    // Vérifier si Groq est activé
    const checkGroqStatus = async () => {
      try {
        const response = await fetch('/api/groq/status');
        const data = await response.json();
        setUsage(prev => ({ ...prev, isConnected: data.enabled && data.connected }));
      } catch {
        setUsage(prev => ({ ...prev, isConnected: false }));
      }
    };
    checkGroqStatus();

    // Mettre à jour périodiquement
    const interval = setInterval(checkGroqStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculer les pourcentages
  const dailyPercent = (usage.dailyRequests / DAILY_LIMIT) * 100;
  const minutePercent = (usage.minuteRequests / MINUTE_LIMIT) * 100;
  const tokenPercent = (usage.dailyTokens / TOKEN_DAILY_LIMIT) * 100;

  // Déterminer le niveau de batterie
  const getBatteryLevel = () => {
    const maxPercent = Math.max(dailyPercent, tokenPercent);
    if (maxPercent >= 90) return 'critical';
    if (maxPercent >= 50) return 'low';
    if (maxPercent >= 20) return 'medium';
    return 'high';
  };

  const batteryLevel = getBatteryLevel();

  // Icône de batterie selon le niveau
  const BatteryIcon = () => {
    if (!usage.isConnected) return <WifiOff className="w-4 h-4 text-red-400" />;
    
    const iconProps = { className: "w-4 h-4" };
    
    if (batteryLevel === 'critical') return <BatteryWarning {...iconProps} className="w-4 h-4 text-red-500 animate-pulse" />;
    if (batteryLevel === 'low') return <BatteryLow {...iconProps} className="w-4 h-4 text-orange-400" />;
    if (batteryLevel === 'medium') return <BatteryMedium {...iconProps} className="w-4 h-4 text-yellow-400" />;
    if (usage.isConnected) return <BatteryCharging {...iconProps} className="w-4 h-4 text-green-400" />;
    return <BatteryFull {...iconProps} className="w-4 h-4 text-green-400" />;
  };

  // Couleur du texte
  const getTextColor = () => {
    if (!usage.isConnected) return 'text-red-400';
    if (batteryLevel === 'critical') return 'text-red-400';
    if (batteryLevel === 'low') return 'text-orange-400';
    if (batteryLevel === 'medium') return 'text-yellow-400';
    return 'text-green-400';
  };

  // Version compacte (juste l'icône)
  if (compact) {
    return (
      <div className={cn("relative group", className)}>
        <BatteryIcon />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#2f2f2f] border border-white/10 rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          <div className="text-xs space-y-1">
            <p className={cn("font-bold", getTextColor())}>
              {usage.isConnected ? 'Groq Connecté' : 'Groq Déconnecté'}
            </p>
            {usage.isConnected && (
              <>
                <p className="text-gray-400">
                  Jour: {usage.dailyRequests.toLocaleString()} / {DAILY_LIMIT.toLocaleString()} ({dailyPercent.toFixed(1)}%)
                </p>
                <p className="text-gray-400">
                  Minute: {usage.minuteRequests} / {MINUTE_LIMIT} ({minutePercent.toFixed(1)}%)
                </p>
                <p className="text-gray-400">
                  Tokens: {usage.dailyTokens.toLocaleString()} / {TOKEN_DAILY_LIMIT.toLocaleString()}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Version complète
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2 bg-black/20 rounded-xl border border-white/5", className)}>
      <BatteryIcon />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <span className={cn("text-xs font-bold uppercase tracking-wider", getTextColor())}>
            {usage.isConnected ? 'Groq' : 'Groq (déconnecté)'}
          </span>
          {usage.isConnected && (
            <span className="text-[10px] text-gray-500">
              {usage.dailyRequests.toLocaleString()} / {DAILY_LIMIT.toLocaleString()} req
            </span>
          )}
        </div>
        
        {usage.isConnected && (
          <>
            {/* Barre de progression quotidienne */}
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Jour</span>
                <span className="text-[9px] text-gray-400">{dailyPercent.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    batteryLevel === 'critical' ? 'bg-red-500' :
                    batteryLevel === 'low' ? 'bg-orange-500' :
                    batteryLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                  )}
                  style={{ width: `${Math.min(dailyPercent, 100)}%` }}
                />
              </div>
            </div>

            {/* Barre de progression tokens */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Tokens</span>
                <span className="text-[9px] text-gray-400">{tokenPercent.toFixed(1)}%</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    tokenPercent >= 90 ? 'bg-red-500' :
                    tokenPercent >= 50 ? 'bg-orange-500' :
                    tokenPercent >= 20 ? 'bg-yellow-500' : 'bg-green-500'
                  )}
                  style={{ width: `${Math.min(tokenPercent, 100)}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {usage.lastUpdated && (
        <span className="text-[8px] text-gray-600">
          {new Date(usage.lastUpdated).toLocaleTimeString().slice(0, 5)}
        </span>
      )}
    </div>
  );
}