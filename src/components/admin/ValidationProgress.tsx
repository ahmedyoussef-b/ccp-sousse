/**
 * @fileOverview ValidationProgress - UI de progression pour la validation des chunks
 * Style "batterie" avec score de qualité
 */

'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, BatteryCharging } from 'lucide-react';

interface ValidationProgressProps {
  fileName: string;
  progress: number;
  currentScore: number;
  isValid: boolean;
  warnings: string[];
  onComplete?: () => void;
}

export function ValidationProgress({ 
  fileName, 
  progress, 
  currentScore, 
  isValid, 
  warnings, 
  onComplete 
}: ValidationProgressProps) {
  return (
    <div className="bg-[#2f2f2f] border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {progress < 100 ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : isValid ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
          <span className="text-xs font-mono text-gray-300 truncate max-w-[200px]">{fileName}</span>
        </div>
        <span className="text-[10px] text-gray-500">{progress}%</span>
      </div>

      <Progress value={progress} className="h-1.5 bg-white/10" />

      {/* Score batterie */}
      <div className="bg-black/30 rounded-lg p-2">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-1">
            <BatteryCharging className={cn(
              "w-3 h-3",
              currentScore >= 0.7 ? "text-green-400" : currentScore >= 0.5 ? "text-yellow-400" : "text-red-400"
            )} />
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">Qualité des chunks</span>
          </div>
          <span className={cn(
            "text-[10px] font-mono font-bold",
            currentScore >= 0.7 ? "text-green-400" : currentScore >= 0.5 ? "text-yellow-400" : "text-red-400"
          )}>
            {(currentScore * 100).toFixed(0)}%
          </span>
        </div>
        <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className={cn(
              "absolute top-0 left-0 h-full transition-all duration-300",
              currentScore >= 0.7 ? "bg-gradient-to-r from-green-500 to-green-400" :
              currentScore >= 0.5 ? "bg-gradient-to-r from-yellow-500 to-yellow-400" :
              "bg-gradient-to-r from-red-500 to-red-400"
            )}
            style={{ width: `${currentScore * 100}%` }}
          />
          {/* Segments batterie */}
          <div className="absolute top-0 right-0 h-full w-[1px] bg-black/40" />
          <div className="absolute top-0 right-[25%] h-full w-[1px] bg-black/40" />
          <div className="absolute top-0 right-[50%] h-full w-[1px] bg-black/40" />
          <div className="absolute top-0 right-[75%] h-full w-[1px] bg-black/40" />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-yellow-400">
          <AlertTriangle className="w-3 h-3" />
          <span className="truncate">{warnings[0]}</span>
        </div>
      )}

      {progress === 100 && onComplete && (
        <button
          onClick={onComplete}
          className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors text-center w-full"
        >
          Fermer
        </button>
      )}
    </div>
  );
}