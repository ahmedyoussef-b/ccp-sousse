/**
 * Composant d'indicateur de confiance et feedback pour les résultats de vision
 */

'use client';

import React, { useState } from 'react';
import { ConfidenceMetadata } from '@/ai/innovations/types';
import { formatConfidenceMessage } from '@/lib/utils/confidence';

interface ConfidenceIndicatorProps {
  confidence: ConfidenceMetadata;
  predictionId: string;
  imageId: string;
  similarityScore: number;
  onFeedbackSubmitted?: (feedback: 'confirm' | 'reject') => void;
  className?: string;
}

export const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({
  confidence,
  predictionId,
  imageId,
  similarityScore,
  onFeedbackSubmitted,
  className = '',
}) => {
  const [feedbackGiven, setFeedbackGiven] = useState<'confirm' | 'reject' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const formatted = formatConfidenceMessage(confidence);
  
  const handleFeedback = async (isCorrect: boolean) => {
    if (feedbackGiven) return;
    
    setIsSubmitting(true);
    
    try {
      const feedback = isCorrect ? 'confirm' : 'reject';
      
      const response = await fetch('/api/innovations/feedback/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictionId,
          imageId,
          similarityScore,
          userFeedback: feedback,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de l\'enregistrement du feedback');
      }
      
      setFeedbackGiven(feedback);
      onFeedbackSubmitted?.(feedback);
    } catch (error) {
      console.error('Erreur feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{formatted.icon}</span>
        <div>
          <p className={`text-sm font-medium ${formatted.color}`}>
            {formatted.message}
          </p>
          <p className="text-xs text-gray-500">
            {formatted.suggestion}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => handleFeedback(true)}
          disabled={!!feedbackGiven || isSubmitting}
          className={`p-2 rounded-full transition-colors ${
            feedbackGiven === 'confirm'
              ? 'bg-green-100 text-green-600'
              : 'hover:bg-gray-200 text-gray-500 hover:text-green-600'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title="Résultat correct"
        >
          👍
        </button>
        
        <button
          onClick={() => handleFeedback(false)}
          disabled={!!feedbackGiven || isSubmitting}
          className={`p-2 rounded-full transition-colors ${
            feedbackGiven === 'reject'
              ? 'bg-red-100 text-red-600'
              : 'hover:bg-gray-200 text-gray-500 hover:text-red-600'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title="Résultat incorrect"
        >
          👎
        </button>
      </div>
      
      {feedbackGiven && (
        <span className="text-xs text-gray-400">
          Merci pour votre feedback !
        </span>
      )}
    </div>
  );
};

export default ConfidenceIndicator;