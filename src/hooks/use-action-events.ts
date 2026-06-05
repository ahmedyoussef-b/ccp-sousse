import { useState, useEffect, useRef } from 'react';

export type ActionStatus = 'start' | 'progress' | 'complete' | 'error' | 'blocked' | 'snapshot' | 'prediction';

export interface ActionEvent {
  id: string;
  module: string;
  type: string;
  status: ActionStatus;
  message: string;
  timestamp: number;
  data?: any;
  duration?: number;
}

export function useActionEvents(maxEvents = 50) {
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 1. Initialisation depuis le localStorage pour éviter la page blanche
    const saved = localStorage.getItem('ai_action_events');
    if (saved) {
      try {
        setEvents(JSON.parse(saved));
      } catch (e) {
        console.error('Erreur chargement cache actions', e);
      }
    }

    // 2. Connexion SSE
    const connect = () => {
      const es = new EventSource('/api/monitor/events');
      eventSourceRef.current = es;

      es.onopen = () => setIsConnected(true);
      
      es.onmessage = (e) => {
        try {
          const event: ActionEvent = JSON.parse(e.data);
          setEvents(prev => {
            const next = [event, ...prev].slice(0, maxEvents);
            localStorage.setItem('ai_action_events', JSON.stringify(next));
            return next;
          });
        } catch (err) {
          console.error('Erreur parsing event SSE', err);
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        // Tentative de reconnexion après 5s
        setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [maxEvents]);

  const clearEvents = () => {
    setEvents([]);
    localStorage.removeItem('ai_action_events');
  };

  return { events, isConnected, clearEvents };
}
