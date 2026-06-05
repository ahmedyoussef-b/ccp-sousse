// app/training/layout.tsx - Version simplifiée (sans navigation dupliquée)

'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { Brain, ArrowLeft } from 'lucide-react';

interface TrainingLayoutProps {
  children: ReactNode;
}

export default function TrainingLayout({ children }: TrainingLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header uniquement - sans navigation secondaire */}
      <div className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">🎯 Centre d'Entraînement</h1>
                <p className="text-sm text-slate-400">Fine-tuning assisté par IA pour modèles locaux</p>
              </div>
            </div>
            <Link 
              href="/"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour au chat
            </Link>
          </div>
        </div>
      </div>

      {/* Contenu principal - sans barre de navigation supplémentaire */}
      <div className="container mx-auto px-6 py-6">
        {children}
      </div>
    </div>
  );
}