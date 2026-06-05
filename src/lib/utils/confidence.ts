import { ConfidenceMetadata } from '@/ai/innovations/types';

export function formatConfidenceMessage(confidence: ConfidenceMetadata): {
  icon: string;
  color: string;
  message: string;
  suggestion: string;
} {
  const percent = Math.round(confidence.score * 100);
  
  if (percent >= 100) {
    return {
      icon: '🛡️',
      color: 'text-blue-600 font-black animate-pulse',
      message: 'CERTIFIÉ CONFORME (100%)',
      suggestion: 'Signature numérique identique',
    };
  }

  switch (confidence.level) {
    case 'high':
      return {
        icon: '✅',
        color: 'text-green-600',
        message: `Fiabilité élevée (${percent}%)`,
        suggestion: 'Résultat fiable',
      };
    case 'medium':
      return {
        icon: '⚠️',
        color: 'text-yellow-600',
        message: `Fiabilité moyenne (${percent}%)`,
        suggestion: 'Vérifiez avant d\'agir',
      };
    case 'low':
      return {
        icon: '❌',
        color: 'text-red-600',
        message: `Fiabilité faible (${percent}%)`,
        suggestion: 'Résultat incertain',
      };
  }
}
