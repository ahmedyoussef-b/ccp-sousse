// src/components/chat/ProcedureGuide.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, X, AlertTriangle, Clock, Maximize2, Minimize2 } from 'lucide-react';

interface Step {
  number: number;
  description: string;
  subSteps?: string[];
  safetyNote?: string;
  verification?: string;
  expectedOutcome?: string;
  duration?: number;
  imageUrl?: string;
}

interface ProcedureGuideProps {
  procedureName: string;
  steps: Step[];
  onComplete: () => void;
  onClose: () => void;
}

export function ProcedureGuide({ procedureName, steps, onComplete, onClose }: ProcedureGuideProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSafetyWarning, setShowSafetyWarning] = useState(true);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  // Timer pour le suivi de la procédure
  useEffect(() => {
    if (!startTime && currentStepIndex === 0) {
      setStartTime(new Date());
    }
    
    const interval = setInterval(() => {
      if (startTime && !isCompleted) {
        setElapsedTime(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [startTime, isCompleted, currentStepIndex]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleNext = useCallback(() => {
    if (isLastStep) {
      setIsCompleted(true);
      onComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
      // Scroll to top of content
      const contentEl = document.getElementById('guide-content');
      if (contentEl) contentEl.scrollTop = 0;
    }
  }, [isLastStep, onComplete]);

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
      const contentEl = document.getElementById('guide-content');
      if (contentEl) contentEl.scrollTop = 0;
    }
  };

  const handleReset = () => {
    setCurrentStepIndex(0);
    setIsCompleted(false);
    setStartTime(new Date());
    setShowSafetyWarning(true);
  };

  if (isCompleted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Procédure terminée !</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Vous avez complété {procedureName} en {formatTime(elapsedTime)}.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Recommencer
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`
      fixed bg-white dark:bg-gray-800 shadow-xl transition-all duration-300 z-50
      ${isExpanded 
        ? 'inset-4 rounded-xl' 
        : 'bottom-4 right-4 w-96 rounded-lg'
      }
    `}>
      {/* Header */}
      <div className="bg-blue-600 dark:bg-blue-700 text-white rounded-t-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" />
              <span>{formatTime(elapsedTime)}</span>
              <span className="text-blue-200">•</span>
              <span>Étape {currentStepIndex + 1}/{steps.length}</span>
            </div>
            <h3 className="font-semibold mt-1">{procedureName}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-blue-500 rounded transition-colors"
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-blue-500 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-3 h-1 bg-blue-400/30 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      
      {/* Content */}
      <div id="guide-content" className="p-4 overflow-y-auto max-h-[60vh]">
        {/* Safety warning */}
        {showSafetyWarning && currentStep.safetyNote && (
          <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Consigne de sécurité</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">{currentStep.safetyNote}</p>
                <button
                  onClick={() => setShowSafetyWarning(false)}
                  className="mt-2 text-xs text-yellow-600 hover:underline"
                >
                  J'ai compris
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Current step */}
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
              {currentStep.number}
            </div>
            <div className="flex-1">
              <p className="text-base font-medium">{currentStep.description}</p>
              
              {currentStep.subSteps && currentStep.subSteps.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {currentStep.subSteps.map((sub, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="text-gray-400">→</span>
                      {sub}
                    </li>
                  ))}
                </ul>
              )}
              
              {currentStep.verification && (
                <div className="mt-3 bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-sm text-green-700 dark:text-green-300">
                  <span className="font-medium">✓ Vérification :</span> {currentStep.verification}
                </div>
              )}
              
              {currentStep.expectedOutcome && (
                <div className="mt-2 text-xs text-gray-500">
                  <span className="font-medium">Résultat attendu :</span> {currentStep.expectedOutcome}
                </div>
              )}
            </div>
          </div>
          
          {/* Duration estimate */}
          {currentStep.duration && (
            <div className="text-xs text-gray-400 flex items-center gap-1 ml-11">
              <Clock className="w-3 h-3" />
              Durée estimée : {currentStep.duration} min
            </div>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <div className="border-t dark:border-gray-700 p-4 flex justify-between">
        <button
          onClick={handlePrevious}
          disabled={currentStepIndex === 0}
          className={`
            px-4 py-2 rounded-lg flex items-center gap-2 transition-colors
            ${currentStepIndex === 0 
              ? 'text-gray-400 cursor-not-allowed' 
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }
          `}
        >
          <ChevronLeft className="w-4 h-4" />
          Précédent
        </button>
        
        <button
          onClick={handleNext}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          {isLastStep ? 'Terminer' : 'Étape suivante'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}