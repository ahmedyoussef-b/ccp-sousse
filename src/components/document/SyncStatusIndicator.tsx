// src/components/document/SyncStatusIndicator.tsx
'use client';

import { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Wifi, WifiOff, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

interface SyncEventLog {
  id: string;
  type: string;
  path?: string;
  message?: string;
  timestamp: Date;
  success?: boolean;
  error?: string;
}

export function SyncStatusIndicator() {
  const { isConnected, lastEvent } = useWebSocket('/api/ws');
  const [events, setEvents] = useState<SyncEventLog[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Ajouter les événements reçus
  useEffect(() => {
    if (!lastEvent) return;

    const newEvent: SyncEventLog = {
      id: `${Date.now()}-${Math.random()}`,
      type: lastEvent.type,
      path: lastEvent.path,
      message: lastEvent.payload?.message,
      timestamp: new Date(),
      success: lastEvent.success,
      error: lastEvent.error
    };

    setEvents(prev => [newEvent, ...prev].slice(0, 50));

    // Auto-cacher après 5 secondes pour les événements de succès
    if (lastEvent.type === 'sync-complete' || lastEvent.type === 'CONNECTED') {
      const timer = setTimeout(() => {
        setEvents(prev => prev.filter(e => e.id !== newEvent.id));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastEvent]);

  const getEventIcon = (type: string, _success?: boolean) => {
    if (type === 'sync-start') return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
    if (type === 'sync-complete') return <CheckCircle className="w-3 h-3 text-green-500" />;
    if (type === 'sync-error') return <AlertCircle className="w-3 h-3 text-red-500" />;
    if (type === 'CONNECTED') return <CheckCircle className="w-3 h-3 text-green-500" />;
    return <div className="w-3 h-3 bg-gray-400 rounded-full" />;
  };

  const getEventText = (event: SyncEventLog) => {
    if (event.type === 'file-changed') return `📄 ${event.path?.split('/').pop() || 'Fichier'} modifié`;
    if (event.type === 'sync-start') return `🔄 Indexation: ${event.path?.split('/').pop() || 'Document'}`;
    if (event.type === 'sync-complete') return `✅ Synchronisé: ${event.path?.split('/').pop() || 'Document'}`;
    if (event.type === 'sync-error') return `❌ Erreur: ${event.error || event.message || 'Échec synchronisation'}`;
    if (event.type === 'CONNECTED') return `🔌 Connecté au moteur de synchronisation`;
    return event.message || event.type;
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-blue-500 text-white rounded-full p-2 shadow-lg hover:bg-blue-600 transition-colors z-50"
        title="Afficher le statut"
      >
        <Wifi className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-[#171717]/95 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10 bg-[#222]">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-500 animate-pulse" />
          )}
          <span className="text-sm font-medium text-gray-200">
            {isConnected ? 'Synchronisation active' : 'Hors ligne'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          >
            {isExpanded ? '▲' : '▼'}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Événements récents */}
      {events.length > 0 && isExpanded && (
        <div className="max-h-48 overflow-y-auto">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2 p-2 border-b border-white/5 text-xs hover:bg-white/5 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5">
                {getEventIcon(event.type, event.success)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 truncate">
                  {getEventText(event)}
                </p>
                <p className="text-gray-400 text-[10px] mt-0.5">
                  {event.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* État actuel (quand replié) */}
      {!isExpanded && events.length > 0 && (
        <div className="p-2 text-xs text-gray-400 border-t border-white/10 bg-[#171717]">
          <div className="flex items-center gap-2">
            {getEventIcon(events[0].type, events[0].success)}
            <span className="truncate flex-1">{getEventText(events[0])}</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-2 text-[10px] text-gray-500 border-t border-white/10 text-center bg-[#171717]">
        {events.length > 0 && !isExpanded ? `${events.length} événement(s) - ` : ''}
        {isConnected ? 'En attente de modifications...' : 'Reconnexion automatique...'}
      </div>
    </div>
  );
}