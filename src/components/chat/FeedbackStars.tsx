// components/chat/FeedbackStars.tsx
'use client';

import { useState } from 'react';
import { Star, CheckCircle, Mic, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useVoiceEnhanced } from '@/hooks/useVoiceEnhanced';

interface FeedbackStarsProps {
  messageId: string;
  question: string;
  answer: string;
  metadata?: any;
  onFeedbackSubmitted?: (rating: number) => void;
  initialRating?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

export function FeedbackStars({ 
  messageId, 
  question, 
  answer, 
  metadata,
  onFeedbackSubmitted, 
  initialRating = 0,
  size = 'md',
  showLabels = false
}: FeedbackStarsProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(initialRating > 0);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentStatus, setEnrichmentStatus] = useState<'idle' | 'recording' | 'processing' | 'done'>('idle');

  // Hook voix pour l'enrichissement
  const {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening
  } = useVoiceEnhanced(async (text) => {
    // Cette fonction est appelée quand on reçoit le texte final
    if (rating === 4 && text.length > 5) {
      await handleEnrichment(text);
    }
  });

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const ratingLabels: Record<number, string> = {
    1: 'Très insatisfaisant',
    2: 'Insatisfaisant',
    3: 'Moyen',
    4: 'Satisfaisant (Enrichir par voix)',
    5: 'Très satisfaisant'
  };

  const getFeedbackMessage = (selectedRating: number): string => {
    switch (selectedRating) {
      case 5: return '⭐ Merci ! Cette réponse sera conservée comme référence.';
      case 4: return '🎤 Dites-moi ce qu\'il manque pour atteindre 5 étoiles...';
      case 3: return '📝 Merci ! Nous allons travailler à améliorer cette réponse.';
      case 2: return '🔧 Merci ! Cette réponse sera corrigée.';
      case 1: return '⚠️ Merci ! Cette réponse a été signalée pour révision.';
      default: return 'Merci pour votre retour !';
    }
  };

  const handleEnrichment = async (text: string) => {
    setEnrichmentStatus('processing');
    try {
      const response = await fetch('/api/training/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          enrichment: text,
          sourceFile: metadata?.bestSourceFile
        })
      });
      
      if (response.ok) {
        setEnrichmentStatus('done');
        toast({
          title: '✅ Enrichissement sauvegardé',
          description: 'Vos précisions ont été ajoutées au fichier source.',
        });
        setFeedbackMessage('✅ Merci ! Votre enrichissement vocal a été ajouté.');
      } else {
        throw new Error('Erreur enrichissement');
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      setEnrichmentStatus('idle');
    }
  };

  const handleRating = async (selectedRating: number) => {
    if (submitted) return;
    
    setIsSubmitting(true);
    setRating(selectedRating);
    
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          question,
          answer,
          rating: selectedRating,
          timestamp: new Date().toISOString()
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSubmitted(true);
        const msg = getFeedbackMessage(selectedRating);
        setFeedbackMessage(msg);
        
        // 🔥 Si 4 étoiles, déclencher automatiquement l'écoute vocale pour l'enrichissement
        if (selectedRating === 4) {
          setIsEnriching(true);
          setEnrichmentStatus('recording');
          setTimeout(() => startListening(), 500);
        }

        // Notification toast
        toast({
          title: `⭐ ${selectedRating} étoile${selectedRating > 1 ? 's' : ''}`,
          description: msg,
          duration: 4000,
        });
        
        onFeedbackSubmitted?.(selectedRating);
      } else {
        throw new Error(data.error || 'Erreur');
      }
    } catch (error) {
      console.error('Erreur feedback:', error);
      setRating(0);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'enregistrer votre feedback',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col gap-2 p-2 bg-white/5 rounded-xl border border-white/5 animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span>{feedbackMessage || 'Merci pour votre retour'}</span>
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(
                  sizeClasses[size],
                  star <= rating ? 'fill-yellow-500 text-yellow-500' : 'text-slate-600',
                  'transition-all'
                )}
              />
            ))}
          </div>
        </div>

        {/* Interface d'enrichissement vocal */}
        {rating === 4 && (isEnriching || enrichmentStatus !== 'idle') && (
          <div className={cn(
            "mt-1 p-3 rounded-lg border flex flex-col gap-2 transition-all duration-300",
            isListening ? "bg-red-500/10 border-red-500/30" : "bg-blue-500/10 border-blue-500/30"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isListening ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Écoute active</span>
                  </div>
                ) : enrichmentStatus === 'processing' ? (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Traitement...</span>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Enrichissement</span>
                )}
              </div>
              
              {isListening && (
                <button 
                  onClick={() => stopListening()}
                  className="px-2 py-0.5 bg-red-500 text-white text-[10px] rounded-md hover:bg-red-600 transition"
                >
                  Terminer
                </button>
              )}
            </div>

            {(interimTranscript || transcript) && (
              <div className="text-xs text-white/80 italic leading-relaxed">
                "{interimTranscript || transcript}"
              </div>
            )}

            {!isListening && enrichmentStatus === 'recording' && (
              <button 
                onClick={() => startListening()}
                className="flex items-center justify-center gap-2 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white transition"
              >
                <Mic className="w-3 h-3" /> Reprendre l'enregistrement
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400 mr-1">Évaluer cette réponse:</span>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => handleRating(star)}
            disabled={isSubmitting}
            className={cn(
              "transition-all hover:scale-110 focus:outline-none",
              isSubmitting && "opacity-50 cursor-not-allowed"
            )}
            title={ratingLabels[star]}
          >
            <Star
              className={cn(
                sizeClasses[size],
                star <= (hoverRating || rating) 
                  ? 'fill-yellow-500 text-yellow-500' 
                  : 'text-slate-600 hover:text-yellow-400',
                'transition-colors'
              )}
            />
          </button>
        ))}
        {isSubmitting && (
          <div className="ml-2 w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
      {showLabels && hoverRating > 0 && (
        <div className="text-xs text-slate-400 animate-in fade-in duration-200">
          {ratingLabels[hoverRating]}
        </div>
      )}
    </div>
  );
}