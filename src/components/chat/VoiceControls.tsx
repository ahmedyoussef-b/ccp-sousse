
'use client';

import React from 'react';
import { Mic, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceControlsProps {
  isListening?: boolean;
  isSpeaking?: boolean;
  onStop?: () => void;
  className?: string;
}

/**
 * VoiceControls - Lightweight indicator for voice activity.
 * Fixed to prevent infinite compilation loops.
 */
export default function VoiceControls({ isListening, isSpeaking, onStop, className }: VoiceControlsProps) {
  if (!isListening && !isSpeaking) return null;

  return (
    <div className={cn(
      "fixed bottom-24 right-8 z-50 animate-in slide-in-from-bottom-2 duration-300",
      className
    )}>
      <div className="bg-[#2f2f2f] border border-white/10 p-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
          isListening ? "bg-red-600 animate-pulse" : "bg-green-600"
        )}>
          {isListening ? <Mic className="w-5 h-5 text-white" /> : <Radio className="w-5 h-5 text-white" />}
        </div>
        <div className="pr-2">
          <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Voice Engine</p>
          <p className="text-xs font-bold text-white">
            {isListening ? "Écoute active..." : "IA en train de parler"}
          </p>
        </div>

        {/* Bouton d'arrêt interactif */}
        {onStop && (
          <button 
            onClick={onStop}
            className="ml-2 p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-orange-500"
            title="Arrêter"
          >
            <div className="w-4 h-4 border-2 border-current rounded-sm flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-current rounded-sm" />
            </div>
          </button>
        )}

        <div className="flex gap-1 ml-1">
          <div className="w-1 h-4 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="w-1 h-6 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-1 h-4 bg-blue-500 rounded-full animate-bounce" />
        </div>
      </div>
    </div>
  );
}
