// components/chat/VoiceInput.tsx
'use client';

import { useVoiceEnhanced } from '@/hooks/useVoiceEnhanced';
import { useState, useEffect } from 'react';

interface VoiceInputProps {
  onSendMessage?: (text: string) => Promise<void>;
  onTranscriptUpdate?: (text: string, isFinal: boolean) => void;
  className?: string;
}

export default function VoiceInput({ 
  onSendMessage, 
  onTranscriptUpdate,
  className = '' 
}: VoiceInputProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  const {
    isListening,
    isSpeaking,
    transcript,
    interimTranscript,
    volume,
    startListening,
    stopListening,
    sendVoiceMessage  } = useVoiceEnhanced(onSendMessage);

  // Mettre à jour le parent avec la transcription
  useEffect(() => {
    if (onTranscriptUpdate) {
      onTranscriptUpdate(interimTranscript || transcript, !interimTranscript);
    }
  }, [transcript, interimTranscript, onTranscriptUpdate]);

  // Gérer le clic sur le microphone
  const handleMicClick = async () => {
    if (isListening) {
      if (interimTranscript) {
        await sendVoiceMessage();
      } else {
        await stopListening();
      }
    } else {
      await startListening();
    }
  };

  // Calculer la taille du cercle en fonction du volume
  const circleScale = 0.8 + volume * 0.4;

  return (
    <div className={`relative ${className}`}>
      {/* Bouton microphone */}
      <button
        onClick={handleMicClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`
          relative w-12 h-12 rounded-full flex items-center justify-center
          transition-all duration-200 focus:outline-none
          ${isListening 
            ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
            : isSpeaking
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-gray-600 hover:bg-gray-700'
          }
        `}
        aria-label={isListening ? 'Arrêter l\'écoute' : 'Démarrer l\'écoute'}
      >
        {/* Icône microphone */}
        <svg
          className={`w-6 h-6 text-white transition-transform duration-150`}
          style={{ transform: `scale(${circleScale})` }}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          {isListening ? (
            // Icône d'arrêt
            <path d="M6 6h12v12H6z" />
          ) : (
            // Icône microphone
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.09-.6-.39-1.14-1-1.14z" />
          )}
        </svg>

        {/* Cercle d'onde sonore (visible pendant l'écoute) */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-75"></span>
            <span className="absolute inset-0 rounded-full animate-pulse bg-red-500 opacity-50"></span>
          </>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 
                      bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
          {isListening 
            ? 'Cliquer pour arrêter' 
            : isSpeaking 
              ? 'L\'IA parle...' 
              : 'Cliquer pour parler'}
        </div>
      )}

      {/* Transcription en direct */}
      {isListening && (interimTranscript || transcript) && (
        <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 
                      bg-gray-800 text-white text-sm rounded-lg p-3 min-w-[300px] max-w-md
                      border border-blue-500 shadow-lg">
          <p className="text-gray-300 text-xs mb-1">🎤 Vous dites:</p>
          <p className="text-white">
            {interimTranscript || transcript}
            {interimTranscript && (
              <span className="ml-1 text-gray-400 animate-pulse">▊</span>
            )}
          </p>
          
          {/* Bouton envoyer (pendant l'écoute) */}
          {interimTranscript && (
            <button
              onClick={sendVoiceMessage}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 
                       text-white text-sm py-1 px-3 rounded transition-colors"
            >
              Envoyer
            </button>
          )}
        </div>
      )}
    </div>
  );
}