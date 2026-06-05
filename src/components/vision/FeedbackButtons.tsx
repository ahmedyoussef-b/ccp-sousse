'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, CheckCircle } from 'lucide-react';

interface FeedbackButtonsProps {
  predictionId: string;
  imageId: string;
  similarityScore: number;
  onFeedbackSubmitted?: (feedback: 'confirm' | 'reject') => void;
  className?: string;
}

export function FeedbackButtons({
  predictionId,
  imageId,
  similarityScore,
  onFeedbackSubmitted,
  className = '',
}: FeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<'confirm' | 'reject' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleFeedback = async (isCorrect: boolean) => {
    if (feedback || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      const feedbackType = isCorrect ? 'confirm' : 'reject';
      
      const response = await fetch('/api/innovations/feedback/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictionId,
          imageId,
          similarityScore,
          userFeedback: feedbackType,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de l\'enregistrement du feedback');
      }
      
      setFeedback(feedbackType);
      onFeedbackSubmitted?.(feedbackType);
    } catch (error) {
      console.error('Erreur feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (feedback) {
    return (
      <div className={`flex items-center gap-2 text-green-400 ${className}`}>
        <CheckCircle className="w-4 h-4" />
        <span className="text-sm">Merci pour votre retour !</span>
      </div>
    );
  }
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-gray-400 mr-1">Ce résultat est-il correct ?</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleFeedback(true)}
        disabled={isSubmitting}
        className="h-8 px-3 bg-green-600/10 border-green-500/30 text-green-400 hover:bg-green-600/20"
      >
        <ThumbsUp className="w-3.5 h-3.5 mr-1" />
        Oui
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleFeedback(false)}
        disabled={isSubmitting}
        className="h-8 px-3 bg-red-600/10 border-red-500/30 text-red-400 hover:bg-red-600/20"
      >
        <ThumbsDown className="w-3.5 h-3.5 mr-1" />
        Non
      </Button>
    </div>
  );
}

export default FeedbackButtons;