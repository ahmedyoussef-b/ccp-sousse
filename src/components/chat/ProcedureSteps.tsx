// src/components/chat/ProcedureSteps.tsx
'use client';

import { useState } from 'react';
import { Check, Clipboard, Play, X } from 'lucide-react';

interface Step {
  number: number;
  description: string;
  subSteps?: string[];
  safetyNote?: string;
  verification?: string;
}

interface ProcedureStepsProps {
  procedureName: string;
  steps: Step[];
  onStartGuide: () => void;
  onClose: () => void;
}

export function ProcedureSteps({
  procedureName,
  steps,
  onStartGuide,
  onClose
}: ProcedureStepsProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    const text = steps.map(s => `${s.number}. ${s.description}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border shadow-lg my-2 max-h-[70vh] overflow-y-auto">
      <div className="sticky top-0 bg-white dark:bg-gray-800 border-b p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">📋 {procedureName}</h3>
          <p className="text-xs text-gray-500">{steps.length} étapes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Copier les étapes"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Clipboard className="w-4 h-4" />}
          </button>
          <button
            onClick={onStartGuide}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
          >
            <Play className="w-3 h-3" />
            Guide pas à pas
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {steps.map((step) => (
          <div key={step.number} className="border-l-4 border-blue-500 pl-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                {step.number}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{step.description}</p>
                
                {step.subSteps && step.subSteps.length > 0 && (
                  <ul className="mt-2 space-y-1 ml-4">
                    {step.subSteps.map((sub, idx) => (
                      <li key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                        <span className="text-gray-400">•</span>
                        {sub}
                      </li>
                    ))}
                  </ul>
                )}
                
                {step.safetyNote && (
                  <div className="mt-2 bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-500 p-2 rounded text-xs text-yellow-800 dark:text-yellow-200">
                    ⚠️ {step.safetyNote}
                  </div>
                )}
                
                {step.verification && (
                  <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                    ✓ Vérification: {step.verification}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}