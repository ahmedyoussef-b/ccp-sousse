'use client';

import { useState, useEffect, useRef } from 'react';
import { STTOptions, STTState } from '@/types/voice';

/**
 * Hook client pour la reconnaissance vocale.
 * Utilise WebSpeech API par défaut et gère l'audio context pour la visualisation.
 */
export function useVoiceRecognition(
  options: STTOptions = {},
  onResult?: (text: string, isFinal: boolean) => void
) {
  const [state, setState] = useState<STTState>({
    isListening: false,
    isProcessing: false,
    transcript: '',
    interimTranscript: '',
    error: null,
    volume: 0
  });

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialisation de l'analyseur audio pour le retour visuel
  const initAudioAnalyser = async () => {
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      updateVolume();
    } catch (err) {
      console.warn("Impossible d'accéder au micro pour la visualisation:", err);
    }
  };

  const updateVolume = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    setState(prev => ({ ...prev, volume: average / 255 }));
    animationFrameRef.current = requestAnimationFrame(updateVolume);
  };

  const cleanupAudio = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
  };

  const startListening = async () => {
    setState(prev => ({ ...prev, error: null, transcript: '', interimTranscript: '' }));
    
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setState(prev => ({ ...prev, error: "Votre navigateur ne supporte pas la reconnaissance vocale." }));
      return;
    }

    try {
      await initAudioAnalyser();
      
      const recognition = new SpeechRecognition();
      recognition.continuous = options.continuous ?? true;
      recognition.interimResults = options.interimResults ?? true;
      recognition.lang = options.language || 'fr-FR';

      recognition.onstart = () => setState(prev => ({ ...prev, isListening: true }));
      
      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (final) {
          setState(prev => ({ ...prev, transcript: prev.transcript + final }));
          onResult?.(final, true);
        }
        
        setState(prev => ({ ...prev, interimTranscript: interim }));
        if (interim) onResult?.(interim, false);
      };

      recognition.onerror = (event: any) => {
        setState(prev => ({ ...prev, error: event.error, isListening: false }));
        cleanupAudio();
      };

      recognition.onend = () => {
        setState(prev => ({ ...prev, isListening: false }));
        cleanupAudio();
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message, isListening: false }));
    }
  };

  const stopListening = async (): Promise<string> => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    cleanupAudio();
    return state.transcript;
  };

  const resetTranscript = () => {
    setState(prev => ({ ...prev, transcript: '', interimTranscript: '' }));
  };

  useEffect(() => {
    return () => cleanupAudio();
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    resetTranscript
  };
}
