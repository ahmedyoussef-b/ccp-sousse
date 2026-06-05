// src/components/chat/ProcedureProposal.tsx
'use client';

import { List, Play, X } from 'lucide-react';

interface ProcedureProposalProps {
  procedureName: string;
  equipment?: string;
  onShowSteps: () => void;
  onStartGuide: () => void;
  onClose: () => void;
}

export function ProcedureProposal({
  procedureName,
  equipment,
  onShowSteps,
  onStartGuide,
  onClose
}: ProcedureProposalProps) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Procédure détectée
            </span>
          </div>
          <p className="text-sm mb-3">
            J'ai trouvé la procédure de <strong>{procedureName}</strong>
            {equipment && <span className="text-blue-600"> ({equipment})</span>}.
            Comment souhaitez-vous procéder ?
          </p>
          <div className="flex gap-3">
            <button
              onClick={onShowSteps}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <List className="w-4 h-4" />
              Afficher les étapes
            </button>
            <button
              onClick={onStartGuide}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
            >
              <Play className="w-4 h-4" />
              Me guider pas à pas
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
}