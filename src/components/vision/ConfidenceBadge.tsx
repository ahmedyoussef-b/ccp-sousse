'use client';

import { ConfidenceMetadata } from '@/ai/innovations/types';
import { formatConfidenceMessage } from '@/lib/utils/confidence';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

interface ConfidenceBadgeProps {
  confidence: ConfidenceMetadata;
  showDetails?: boolean;
  className?: string;
}

export function ConfidenceBadge({ confidence, showDetails = false, className = '' }: ConfidenceBadgeProps) {
  const formatted = formatConfidenceMessage(confidence);
  
  const icons = {
    high: <ShieldCheck className="w-4 h-4" />,
    medium: <ShieldAlert className="w-4 h-4" />,
    low: <ShieldX className="w-4 h-4" />,
  };
  
  const colors = {
    high: 'bg-green-600/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-red-600/20 text-red-400 border-red-500/30',
  };
  
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Badge className={`flex items-center gap-1.5 px-3 py-1.5 border ${colors[confidence.level]}`}>
        {icons[confidence.level]}
        <span className="font-medium">{formatted.message}</span>
      </Badge>
      
      {showDetails && (
        <div className="text-xs text-gray-400 mt-1 space-y-1">
          <p>{formatted.suggestion}</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {confidence.factors.map((factor, i) => (
              <span key={i} className="bg-gray-800 px-2 py-0.5 rounded text-gray-300">
                {factor.name}: {(factor.value * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ConfidenceBadge;