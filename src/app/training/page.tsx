// app/training/page.tsx - Version avec onglet Feedbacks
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Star, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const ManualTrainingInterface = dynamic(
  () => import('@/components/training/ManualTrainingInterface').then(mod => mod.ManualTrainingInterface),
  { loading: () => <LoadingSpinner />, ssr: false }
);

const TrainingDashboard = dynamic(
  () => import('@/components/training/TrainingDashboard'),
  { loading: () => <LoadingSpinner />, ssr: false }
);

const ColabWorkflow = dynamic(
  () => import('@/components/training/ColabWorkflow').then(mod => mod.ColabWorkflow),
  { loading: () => <LoadingSpinner />, ssr: false }
);

const TrainingHistory = dynamic(
  () => import('@/components/training/TrainingHistory').then(mod => mod.TrainingHistory),
  { loading: () => <LoadingSpinner />, ssr: false }
);

const ModelIntegrationWizard = dynamic(
  () => import('@/components/training/ModelIntegrationWizard').then(mod => mod.ModelIntegrationWizard),
  { loading: () => <LoadingSpinner />, ssr: false }
);

const FeedbackDashboard = dynamic(
  () => import('@/components/training/FeedbackDashboard').then(mod => mod.FeedbackDashboard),
  { loading: () => <LoadingSpinner />, ssr: false }
);

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
    </div>
  );
}

function TrainingPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['dashboard', 'manual', 'colab', 'history', 'integration', 'feedbacks'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    router.push(`/training?tab=${value}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header with back button */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-slate-900/40 backdrop-blur-sm sticky top-0 z-10">
        <Link
          href="/"
          className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95 shrink-0"
          title="Retour à l'accueil"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-sm font-black text-white uppercase tracking-widest">Entraînement IA</h1>
          <p className="text-[10px] text-slate-500">Gestion des cycles d'apprentissage et des feedbacks</p>
        </div>
      </div>

      <div className="p-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-slate-900/50 border border-slate-800 p-1 flex flex-wrap gap-1">
          <TabsTrigger 
            value="dashboard" 
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            📊 Dashboard
          </TabsTrigger>
          <TabsTrigger 
            value="manual" 
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            📝 Collecte Manuelle
          </TabsTrigger>
          <TabsTrigger 
            value="colab" 
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            ☁️ Colab Studio
          </TabsTrigger>
          <TabsTrigger 
            value="integration" 
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            🔧 Intégration Ollama
          </TabsTrigger>
          <TabsTrigger 
            value="feedbacks" 
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Star className="w-4 h-4 mr-2" />
            Feedbacks
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            📜 Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <TrainingDashboard />
        </TabsContent>

        <TabsContent value="manual" className="mt-6">
          <ManualTrainingInterface />
        </TabsContent>

        <TabsContent value="colab" className="mt-6">
          <ColabWorkflow />
        </TabsContent>

        <TabsContent value="integration" className="mt-6">
          <ModelIntegrationWizard />
        </TabsContent>

        <TabsContent value="feedbacks" className="mt-6">
          <FeedbackDashboard />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <TrainingHistory />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

export default function TrainingPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TrainingPageContent />
    </Suspense>
  );
}