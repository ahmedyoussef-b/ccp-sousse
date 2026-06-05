// src/hooks/useVoice.ts
'use client';

import { useState, useCallback, useEffect } from 'react';
import { VoiceOptions, VoiceState } from '@/types/voice';

// 🔥 État global pour synchroniser toutes les instances du hook
let globalAudio: HTMLAudioElement | null = null;
let globalAbortController: AbortController | null = null;
let globalIsPlaying = false;
let globalIsPaused = false;
let globalCurrentText: string | null = null;

// Système simple d'abonnés pour notifier les changements d'état global
const subscribers = new Set<(state: Partial<VoiceState>) => void>();

const notifySubscribers = () => {
  const stateUpdate = {
    isPlaying: globalIsPlaying,
    isPaused: globalIsPaused,
    currentText: globalCurrentText
  };
  subscribers.forEach(callback => callback(stateUpdate));
};

interface UseVoiceReturn {
  isPlaying: boolean;
  isPaused: boolean;
  currentText: string | null;
  queue: string[];
  volume: number;
  speed: number;
  provider: string;
  voice: string;
  play: (text: string, options?: Partial<VoiceOptions>) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  setSpeed: (speed: number) => void;
  setVoice: (voice: string) => void;
  setProvider: (provider: string) => void;
  clearQueue: () => void;
}

export function useVoice(): UseVoiceReturn {
  const [state, setState] = useState<VoiceState>({
    isPlaying: globalIsPlaying,
    isPaused: globalIsPaused,
    currentText: globalCurrentText,
    queue: [],
    volume: 1,
    speed: 1,
    provider: 'edge',
    voice: 'female-1'
  });

  // S'abonner aux changements globaux pour que toutes les instances de useVoice soient synchronisées
  useEffect(() => {
    const callback = (update: Partial<VoiceState>) => {
      setState(prev => ({ ...prev, ...update }));
    };
    subscribers.add(callback);
    
    // Synchronisation initiale au cas où la voix tourne déjà
    setState(prev => ({
      ...prev,
      isPlaying: globalIsPlaying,
      isPaused: globalIsPaused,
      currentText: globalCurrentText
    }));

    return () => {
      subscribers.delete(callback);
    };
  }, []);

  const stop = useCallback(() => {
    console.log('[useVoice] ⏹️ Stop global demandé');
    
    // 1. Annuler toute requête en cours
    if (globalAbortController) {
      globalAbortController.abort();
      globalAbortController = null;
    }

    // 2. Arrêter l'audio global
    if (globalAudio) {
      globalAudio.pause();
      globalAudio.src = '';
      globalAudio = null;
    }

    // 3. Mettre à jour l'état global et notifier les abonnés
    globalIsPlaying = false;
    globalIsPaused = false;
    globalCurrentText = null;
    notifySubscribers();
  }, []);

  const play = useCallback(async (text: string, options?: Partial<VoiceOptions>) => {
    if (!text) return;
    
    console.log(`[useVoice] 🔊 Play global: "${text.substring(0, 30)}..."`);
    
    // Arrêter toute lecture en cours
    stop();

    try {
      globalAbortController = new AbortController();
      globalIsPlaying = true;
      globalIsPaused = false;
      globalCurrentText = text;
      notifySubscribers();

      const response = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          provider: options?.provider || state.provider,
          voice: options?.voice || state.voice,
          speed: options?.speed || state.speed
        }),
        signal: globalAbortController.signal
      });

      if (!response.ok) {
        console.warn('[useVoice] ⚠️ API synthèse indisponible, tentative fallback navigateur...');
        throw new Error('Échec de la synthèse serveur');
      }

      const data = await response.json();
      if (!data.audio) throw new Error('Aucun audio reçu');

      const audioData = `data:audio/${data.format};base64,${data.audio}`;
      const audio = new Audio(audioData);
      globalAudio = audio;
      
      audio.volume = state.volume;
      audio.playbackRate = state.speed;

      audio.onended = () => {
        if (globalAudio === audio) {
          console.log('[useVoice] ✅ Lecture terminée');
          globalAudio = null;
          globalIsPlaying = false;
          globalIsPaused = false;
          globalCurrentText = null;
          notifySubscribers();
        }
      };

      audio.onerror = () => {
        if (globalAudio === audio) {
          console.error('[useVoice] ❌ Erreur audio');
          globalAudio = null;
          globalIsPlaying = false;
          globalIsPaused = false;
          globalCurrentText = null;
          notifySubscribers();
        }
      };

      await audio.play();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[useVoice] ⏹️ Synthèse annulée');
      } else {
        console.warn('[useVoice] ⚠️ Erreur TTS serveur, fallback Web Speech API:', error?.message);
        // ── Fallback : navigateur natif Web Speech API ──
        try {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'fr-FR';
            utterance.rate = state.speed;
            utterance.volume = state.volume;
            utterance.onend = () => {
              globalIsPlaying = false;
              globalIsPaused = false;
              globalCurrentText = null;
              notifySubscribers();
            };
            utterance.onerror = () => {
              globalIsPlaying = false;
              globalIsPaused = false;
              globalCurrentText = null;
              notifySubscribers();
            };
            window.speechSynthesis.speak(utterance);
          } else {
            // Pas de voix disponible — on se contente du texte affiché
            globalIsPlaying = false;
            globalIsPaused = false;
            globalCurrentText = null;
            notifySubscribers();
          }
        } catch (fallbackError) {
          console.warn('[useVoice] ⚠️ Fallback Web Speech aussi indisponible', fallbackError);
          globalIsPlaying = false;
          globalIsPaused = false;
          globalCurrentText = null;
          notifySubscribers();
        }
      }
    }
  }, [state.provider, state.voice, state.speed, state.volume, stop]);

  const pause = useCallback(() => {
    if (globalAudio) {
      console.log('[useVoice] ⏸️ Pause globale');
      globalAudio.pause();
      globalIsPlaying = false;
      globalIsPaused = true;
      notifySubscribers();
    }
  }, []);

  const resume = useCallback(() => {
    if (globalAudio) {
      console.log('[useVoice] ▶️ Reprise globale');
      globalAudio.play();
      globalIsPlaying = true;
      globalIsPaused = false;
      notifySubscribers();
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    setState(prev => ({ ...prev, volume }));
    if (globalAudio) globalAudio.volume = volume;
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState(prev => ({ ...prev, speed }));
    if (globalAudio) globalAudio.playbackRate = speed;
  }, []);

  const setVoice = useCallback((voice: string) => {
    setState(prev => ({ ...prev, voice }));
  }, []);

  const setProvider = useCallback((provider: string) => {
    setState(prev => ({ ...prev, provider: provider as any }));
  }, []);

  const clearQueue = useCallback(() => {
    setState(prev => ({ ...prev, queue: [] }));
  }, []);

  return {
    ...state,
    play,
    pause,
    resume,
    stop,
    setVolume,
    setSpeed,
    setVoice,
    setProvider,
    clearQueue
  };
}
