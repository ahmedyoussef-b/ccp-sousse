// src/hooks/useWebSocket.ts
'use client';

import { useState, useEffect, useRef } from 'react';

export interface WSEvent {
  type: 'file-changed' | 'sync-start' | 'sync-complete' | 'sync-error' | 'CONNECTED';
  path?: string;
  payload?: any;
  timestamp?: number;
  success?: boolean;
  error?: string;
}

export function useWebSocket(url?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountingRef = useRef(false);

  // ──────────────────────────────────────────────────────────────
  // Guard: désactive le WebSocket/SSE sur Vercel (serverless) ou
  // quand NEXT_PUBLIC_DISABLE_WEBSOCKET=true est défini.
  // ──────────────────────────────────────────────────────────────
  const isDisabled =
    process.env.NEXT_PUBLIC_DISABLE_WEBSOCKET === 'true' ||
    process.env.NEXT_PUBLIC_VERCEL === '1';

  const connect = () => {
    if (typeof window === 'undefined') return;
    if (isDisabled) {
      console.log('[SYNC] WebSocket désactivé (Vercel / NEXT_PUBLIC_DISABLE_WEBSOCKET=true)');
      return;
    }
    if (eventSourceRef.current?.readyState === EventSource.OPEN) return;

    const endpoint = url || '/api/ws';
    console.log(`[SYNC] Initialisation du canal de synchronisation : ${endpoint}`);

    const es = new EventSource(endpoint);

    es.onopen = () => {
      console.log('[SYNC] Canal de synchronisation opérationnel.');
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        setLastEvent(data);
        // Log les événements importants
        if (data.type === 'sync-start') {
          console.log(`[SYNC] Début synchronisation: ${data.payload?.path}`);
        }
        if (data.type === 'sync-complete') {
          console.log(`[SYNC] Synchronisation terminée avec succès`);
        }
        if (data.type === 'sync-error') {
          console.error(`[SYNC] Erreur: ${data.error}`);
        }
      } catch (e) {
        // Ignorer les heartbeats
      }
    };

    es.onerror = (_error) => {
      console.warn('[SYNC] Déconnexion du canal. Tentative de reconnexion...');
      setIsConnected(false);
      
      // Fermer l'ancienne connexion
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Reconnexion automatique après 3 secondes (sauf si démontage)
      if (!isUnmountingRef.current) {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[SYNC] Tentative de reconnexion...');
          connect();
        }, 3000);
      }
    };

    eventSourceRef.current = es;
  };

  useEffect(() => {
    isUnmountingRef.current = false;
    connect();

    return () => {
      isUnmountingRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        // Ne pas fermer immédiatement, laisser le temps aux événements de finir
        setTimeout(() => {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            console.log('[SYNC] Canal de synchronisation fermé.');
          }
        }, 1000);
      }
    };
  }, [url]);

  // Fonction pour forcer la reconnexion si nécessaire
  const reconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    connect();
  };

  return { isConnected, lastEvent, reconnect };
}