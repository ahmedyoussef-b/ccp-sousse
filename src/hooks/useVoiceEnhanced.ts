'use client';

import { useState, useEffect } from 'react';
import { useVoiceRecognition } from './useVoiceRecognition';
import { useVoice } from './useVoice';

/**
 * Combine la reconnaissance (STT) et la synthèse (TTS) pour une interaction fluide.
 */
export function useVoiceEnhanced(onSendMessage?: (text: string) => Promise<void>) {
  const [autoPlayResponse, setAutoPlayResponse] = useState(true);

  const {
    isListening,
    transcript,
    interimTranscript,
    volume,
    startListening,
    stopListening,
    resetTranscript
  } = useVoiceRecognition(
    { language: 'fr-FR', continuous: false, interimResults: true },
    async (text, isFinal) => {
      if (isFinal && onSendMessage) {
        // Envoi automatique si configuré
        await onSendMessage(text);
        resetTranscript();
      }
    }
  );

  const { isPlaying: isSpeaking, stop: stopSpeaking } = useVoice();

  // Arrêter l'écoute si l'IA commence à parler
  useEffect(() => {
    if (isSpeaking && isListening) {
      stopListening();
    }
  }, [isSpeaking, isListening, stopListening]);

  const sendVoiceMessage = async () => {
    const finalText = await stopListening();
    if (finalText && onSendMessage) {
      await onSendMessage(finalText);
      resetTranscript();
    }
  };

  return {
    isListening,
    transcript,
    interimTranscript,
    volume,
    isSpeaking,
    startListening,
    stopListening,
    stopSpeaking,
    sendVoiceMessage,
    autoPlayResponse,
    setAutoPlayResponse,
    resetTranscript
  };
}
