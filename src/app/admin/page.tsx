'use client';

import dynamic from 'next/dynamic';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Database, 
  Moon,
  RefreshCw,
  TrendingUp,
  Activity,
  CheckCircle2,
  Wifi,
  WifiOff,
  Loader2,
  ImageIcon,
  Layers3,
  FolderTree,
  Hash,
  Tag,
  Link2,
  Plus,
  GitMerge
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

// Chargement dynamique des composants lourds
const DocumentManager = dynamic(() => import('@/components/document-manager/DocumentManager').then(mod => mod.DocumentManager), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
});

const MetadataIntegrator = dynamic(() => import('@/components/admin/MetadataIntegrator').then(mod => mod.MetadataIntegrator), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-yellow-500" /></div>
});

const ImageBank = dynamic(() => import('@/components/admin/ImageBank'), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>
});

const InnovationTester = dynamic(() => import('@/components/industrial-vision/InnovationTester').then(mod => mod.InnovationTester), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
});

const PanoramicAssemblyModule = dynamic(
  () => import('@/components/industrial-vision/innovations/PanoramicAssemblyModule').then(m => m.PanoramicAssemblyModule),
  { loading: () => <div className="flex items-center justify-center h-[600px]"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div> }
);

// Composant de bibliothèque de référence
const ReferenceLibrary = dynamic(
  () => import('@/components/reference/ReferenceLibrary').then(m => m.ReferenceLibrary),
  { loading: () => <div className="flex items-center justify-center h-[600px]"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div> }
);

// Types
import { IngestionProgress, SystemHealth } from '@/lib/document-manager/types';


export default function AdminPage() {
  const [trainingData, setTrainingData] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [activeJobs, setActiveJobs] = useState<IngestionProgress[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [activeTab, setActiveTab] = useState('files');
  const [showPanoramic, setShowPanoramic] = useState(false);
  const [referenceSubTab, setReferenceSubTab] = useState<'hierarchy' | 'upload' | 'bank'>('hierarchy');
  const [referenceStats, setReferenceStats] = useState({
    zones: 0,
    circuits: 0,
    parametres: 0,
    linkedImages: 0
  });
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sseEnabledRef = useRef<boolean>(true);
  const brainPollingRef = useRef<NodeJS.Timeout | null>(null);

  // === 1. CHARGEMENT INITIAL ===
  useEffect(() => { 
    checkSystemHealth();
    setupSSEMonitoring();
    loadReferenceStats();
    
    const backgroundPolling = setInterval(() => {
      if (!document.hidden) checkSystemHealth();
    }, 120000); 

    return () => {
      clearInterval(backgroundPolling);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (brainPollingRef.current) {
        clearInterval(brainPollingRef.current);
      }
    };
  }, []);

  // Polling actif sur l'onglet "Cerveau Elite"
  useEffect(() => {
    if (activeTab === 'brain') {
      loadTrainingData();
      brainPollingRef.current = setInterval(() => {
        if (!document.hidden) {
          loadTrainingData();
          checkSystemHealth();
        }
      }, 60000);
    } else {
      if (brainPollingRef.current) {
        clearInterval(brainPollingRef.current);
        brainPollingRef.current = null;
      }
    }
    return () => {
      if (brainPollingRef.current) {
        clearInterval(brainPollingRef.current);
        brainPollingRef.current = null;
      }
    };
  }, [activeTab]);

  // Recharger les stats de référence quand l'onglet métadonnées est actif
  useEffect(() => {
    if (activeTab === 'metadata') {
      loadReferenceStats();
    }
  }, [activeTab]);

  // === 2. MONITORING SSE POUR UPLOADS ===
  const setupSSEMonitoring = () => {
    fetch('/api/ingest/stream', { method: 'HEAD' })
      .then(() => {
        if (!sseEnabledRef.current) return;
        
        try {
          const es = new EventSource('/api/ingest/stream');
          eventSourceRef.current = es;

          es.onopen = () => {
            console.log('[Admin] SSE connection established');
          };

          es.onmessage = (event) => {
            try {
              const data: IngestionProgress = JSON.parse(event.data);
              setActiveJobs(prev => {
                const existing = prev.findIndex(j => j.jobId === data.jobId);
                if (existing >= 0) {
                  const newJobs = [...prev];
                  newJobs[existing] = data;
                  return newJobs;
                }
                return [...prev, data];
              });

              if (data.status === 'completed') {
                toast({
                  title: "✅ Document ingéré",
                  description: `${data.fileName} intégré avec succès dans ChromaDB`,
                });
                loadTrainingData();
              }
              if (data.status === 'failed') {
                toast({
                  variant: "destructive",
                  title: "❌ Échec ingestion",
                  description: `${data.fileName}: ${data.error}`,
                });
              }
            } catch (parseError) {
              console.error('[Admin] Failed to parse SSE message:', parseError);
            }
          };

          es.onerror = () => {
            console.warn('[Admin] SSE connection error, disabling monitoring');
            es.close();
            sseEnabledRef.current = false;
          };
        } catch (e) {
          console.warn('[Admin] Failed to setup SSE:', e);
          sseEnabledRef.current = false;
        }
      })
      .catch(() => {
        console.log('[Admin] SSE monitoring disabled (endpoint not available)');
        sseEnabledRef.current = false;
      });
  };

  // === 3. HEALTH CHECK ===
  const checkSystemHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      } else {
        throw new Error('Health check failed');
      }
    } catch (e) {
      setSystemHealth({
        chromaDB: false,
        ollama: false,
        embeddings: false,
        lastCheck: new Date().toISOString()
      });
    }
  };

  // === 4. CHARGEMENT DONNÉES ENTRAÎNEMENT ===
  const loadTrainingData = async () => {
    try {
      const res = await fetch('/api/training/dashboard');
      if (res.ok) {
        const data = await res.json();
        setTrainingData(data);
      }
    } catch (e) {
      console.error("Failed to load training data", e);
    }
  };

  // === 5. CHARGEMENT STATS RÉFÉRENCE ===
  const loadReferenceStats = async () => {
    try {
      const res = await fetch('/api/reference/stats');
      if (res.ok) {
        const data = await res.json();
        setReferenceStats(data);
      }
    } catch (e) {
      console.error("Failed to load reference stats", e);
    }
  };

  // === 6. OPTIMISATION MANUELLE ===
  const handleGlobalOptimization = async () => {
    setIsOptimizing(true);
    toast({ 
      title: "🌙 Cycle nocturne lancé", 
      description: "AGENTIC analyse et consolide ses connaissances...", 
      duration: 5000
    });
    
    try {
      const res = await fetch('/api/learning/nightly-cycle', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }) 
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      const result = await res.json();
      toast({ 
        title: "✨ Auto-amélioration réussie", 
        description: `Modèle optimisé. Gain de précision: +${(result.improvement * 100).toFixed(1)}%` 
      });
      loadTrainingData();
      checkSystemHealth();
    } catch (e) {
      toast({ 
        variant: "destructive", 
        title: "❌ Erreur", 
        description: "L'optimisation globale a échoué. Vérifiez les logs." 
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  // === 7. RAFRAÎCHISSEMENT MANUEL ===
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadTrainingData(), checkSystemHealth(), loadReferenceStats()]);
    setIsRefreshing(false);
    toast({ title: "🔄 Synchronisation", description: "Données mises à jour" });
  };

  // === 8. RÉINITIALISATION TOTALE ===
  const handleReset = async () => {
    const confirmed = window.confirm(
      "⚠️ ATTENTION : Cette action va supprimer TOUS les documents indexés et vider la base de données ChromaDB.\n\nLe cache permanent NE SERA PAS touché.\n\nVoulez-vous continuer ?"
    );

    if (!confirmed) return;

    setIsResetting(true);
    toast({ 
      title: "🔥 Réinitialisation en cours", 
      description: "Nettoyage de la base de données et des fichiers...", 
      duration: 5000 
    });

    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        toast({ 
          title: "✅ Système réinitialisé", 
          description: data.message 
        });

        try { window.dispatchEvent(new Event('bank-reset')); } catch (e) { console.warn('dispatch bank-reset failed', e); }

        await new Promise(res => setTimeout(res, 300));

        await handleRefresh();
      } else {
        throw new Error(data.error || "Erreur inconnue");
      }
    } catch (e: any) {
      toast({ 
        variant: "destructive", 
        title: "❌ Échec de la réinitialisation", 
        description: e.message 
      });
    } finally {
      setIsResetting(false);
    }
  };

  const chartData = trainingData?.improvementTrend?.map((val: number, i: number) => ({
    name: `Cycle ${i+1}`,
    gain: val * 100
  })) || [];

  return (
    <div className="min-h-screen bg-[#171717] text-white p-4 md:p-10 font-body">

      {/* ====== PANORAMIC STUDIO OVERLAY ====== */}
      {showPanoramic && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#050507',
            zIndex: 9999
          }}
        >
          <button
            onClick={() => setShowPanoramic(false)}
            style={{
              position: 'absolute',
              top: 16, left: 16,
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              color: '#fff',
              fontSize: 11,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              backdropFilter: 'blur(12px)'
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Retour Admin
          </button>
          <PanoramicAssemblyModule />
        </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 max-w-6xl mx-auto gap-6">
        <div className="flex items-center gap-4">
          <div className="p-2 md:p-3 bg-blue-600 rounded-xl md:rounded-2xl shadow-lg shadow-blue-500/20">
            <Database className="w-5 h-5 md:w-7 md:h-7" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tighter uppercase">Administration</h1>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Base de Connaissances & ML</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
          {systemHealth && (
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/10">
              {systemHealth.chromaDB && systemHealth.ollama ? (
                <>
                  <Wifi className="w-3 h-3 text-green-500" />
                  <span className="text-[10px] font-bold text-green-500">SYSTEME OK</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-red-500" />
                  <span className="text-[10px] font-bold text-red-500">DÉFAILLANCE</span>
                </>
              )}
            </div>
          )}

          <Button 
            onClick={handleRefresh}
            variant="outline"
            size="icon"
            disabled={isRefreshing}
            className="bg-white/5 border-white/10 h-10 md:h-11 w-10 md:w-11 rounded-xl"
          >
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>

          <Button 
            onClick={handleGlobalOptimization}
            disabled={isOptimizing}
            className="bg-yellow-600 hover:bg-yellow-500 text-white gap-2 h-10 md:h-11 px-4 md:px-6 rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-yellow-500/10"
          >
            {isOptimizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Moon className="w-4 h-4" />}
            {isOptimizing ? 'Optimisation...' : 'Cycle Nocturne'}
          </Button>

          <Button variant="outline" asChild className="bg-white/5 border-white/10">
            <Link href="/admin/reindex">
              <Database className="w-4 h-4 mr-2" />
              Réindexation
            </Link>
          </Button>

          <Button asChild className="bg-orange-600 hover:bg-orange-500 text-white gap-2 h-10 md:h-11 px-4 md:px-6 rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-orange-500/10">
            <Link href="/admin/circuit-mindmap">
              <GitMerge className="w-4 h-4 mr-2" />
              🧠 Topologie & Mind Map
            </Link>
          </Button>

          <Button 
            onClick={handleReset}
            disabled={isResetting || isOptimizing}
            variant="destructive"
            className="bg-red-600 hover:bg-red-500 text-white gap-2 h-10 md:h-11 px-4 md:px-6 rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-red-500/10"
          >
            {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4 text-white/50" />}
            {isResetting ? 'Réinitialisation...' : 'Reset Système'}
          </Button>

          <Button variant="outline" size="icon" asChild className="bg-white/5 border-white/10 h-10 md:h-11 w-10 md:w-11 rounded-xl">
            <Link href="/">
              <ArrowLeft className="w-4 md:w-5 h-4 md:h-5" />
            </Link>
          </Button>
        </div>
      </header>

      {activeJobs.length > 0 && sseEnabledRef.current && (
        <div className="max-w-6xl mx-auto mb-6 space-y-2">
          {activeJobs.filter(j => j.status === 'processing' || j.status === 'pending').map(job => (
            <div key={job.jobId} className="bg-yellow-600/10 border border-yellow-500/30 rounded-xl p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-mono text-yellow-400">{job.fileName}</span>
                <span className="text-gray-400">{job.progress}% - {job.step}</span>
              </div>
              <Progress value={job.progress} className="h-1 bg-yellow-600/20" />
            </div>
          ))}
        </div>
      )}

      <main className="max-w-6xl mx-auto space-y-8 md:space-y-12">
        <Tabs defaultValue="files" className="space-y-6" onValueChange={setActiveTab}>
          <TabsList className="bg-white/5 border border-white/10 p-1 h-11 md:h-12 rounded-xl flex w-full md:w-max">
            <TabsTrigger value="files" className="flex-1 md:flex-none rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white font-bold px-4 md:px-6 text-xs md:text-sm">
              📁 Explorateur ChromaDB
            </TabsTrigger>
            <TabsTrigger value="metadata" className="flex-1 md:flex-none rounded-lg data-[state=active]:bg-amber-600 data-[state=active]:text-white font-bold px-4 md:px-6 text-xs md:text-sm">
              ✨ Métadonnées & Référence
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex-1 md:flex-none rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white font-bold px-4 md:px-6 text-xs md:text-sm">
              🚀 Pipeline Vision Expert
            </TabsTrigger>
            <TabsTrigger value="lab" className="flex-1 md:flex-none rounded-lg data-[state=active]:bg-orange-600 data-[state=active]:text-white font-bold px-4 md:px-6 text-xs md:text-sm">
              🧪 Laboratoire IA
            </TabsTrigger>
            <TabsTrigger value="brain" className="flex-1 md:flex-none rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white font-bold px-4 md:px-6 text-xs md:text-sm">
              🧠 Cerveau Elite
            </TabsTrigger>
          </TabsList>

          {/* Onglet 1: Explorateur ChromaDB */}
          <TabsContent value="files">
            {activeTab === 'files' && (
              <DocumentManager 
                onUploadComplete={loadTrainingData} 
                externalActiveJobs={activeJobs}
              />
            )}
          </TabsContent>

          {/* Onglet 2: Métadonnées + Référence Constructeur */}
          <TabsContent value="metadata">
            {activeTab === 'metadata' && (
              <div className="space-y-6">
                {/* Cartes de stats référence */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-white/5 border-white/10 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase font-bold">Zones</p>
                        <p className="text-xl font-bold text-white">{referenceStats.zones}</p>
                      </div>
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Hash className="w-4 h-4 text-blue-400" />
                      </div>
                    </div>
                  </Card>
                  <Card className="bg-white/5 border-white/10 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase font-bold">Circuits</p>
                        <p className="text-xl font-bold text-white">{referenceStats.circuits}</p>
                      </div>
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <Tag className="w-4 h-4 text-green-400" />
                      </div>
                    </div>
                  </Card>
                  <Card className="bg-white/5 border-white/10 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase font-bold">Paramètres</p>
                        <p className="text-xl font-bold text-white">{referenceStats.parametres}</p>
                      </div>
                      <div className="p-2 bg-purple-500/10 rounded-lg">
                        <Link2 className="w-4 h-4 text-purple-400" />
                      </div>
                    </div>
                  </Card>
                  <Card className="bg-white/5 border-white/10 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase font-bold">Images liées</p>
                        <p className="text-xl font-bold text-white">{referenceStats.linkedImages}</p>
                      </div>
                      <div className="p-2 bg-indigo-500/10 rounded-lg">
                        <ImageIcon className="w-4 h-4 text-indigo-400" />
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Actions rapides */}
                <div className="flex gap-3">
                  <Button 
                    variant={referenceSubTab === 'hierarchy' ? 'default' : 'outline'}
                    onClick={() => setReferenceSubTab('hierarchy')}
                    className={cn(
                      "gap-2",
                      referenceSubTab === 'hierarchy' ? "bg-amber-600 hover:bg-amber-500" : "bg-white/5 border-white/10"
                    )}
                  >
                    <FolderTree className="w-4 h-4" />
                    Hiérarchie Zone/Circuit/Paramètre
                  </Button>
                  <Button 
                    variant={referenceSubTab === 'upload' ? 'default' : 'outline'}
                    onClick={() => setReferenceSubTab('upload')}
                    className={cn(
                      "gap-2",
                      referenceSubTab === 'upload' ? "bg-green-600 hover:bg-green-500" : "bg-white/5 border-white/10"
                    )}
                  >
                    <Plus className="w-4 h-4" />
                    Upload avec référence
                  </Button>
                  <Button 
                    variant={referenceSubTab === 'bank' ? 'default' : 'outline'}
                    onClick={() => setReferenceSubTab('bank')}
                    className={cn(
                      "gap-2",
                      referenceSubTab === 'bank' ? "bg-blue-600 hover:bg-blue-500" : "bg-white/5 border-white/10"
                    )}
                  >
                    <ImageIcon className="w-4 h-4" />
                    Banque d'Images
                  </Button>
                </div>

                {/* Contenu du sous-onglet */}
                <div className="mt-6">
                  {referenceSubTab === 'hierarchy' ? (
                    <ReferenceLibrary />
                  ) : referenceSubTab === 'upload' ? (
                    <div className="p-12 text-center bg-white/5 rounded-[2rem] border border-white/10 border-dashed">
                      <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Module d'Upload Intelligent</p>
                      <p className="text-gray-500 text-[10px] mt-2">Association automatique d'images aux IDs de référence via IA Vision.</p>
                    </div>
                  ) : (
                    <ImageBank />
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Onglet 3: Pipeline Vision Expert (RESTORED) */}
          <TabsContent value="pipeline">
            {activeTab === 'pipeline' && (
              <div className="h-[800px] bg-black/20 rounded-[2.5rem] border border-white/5 overflow-hidden">
                <MetadataIntegrator />
              </div>
            )}
          </TabsContent>

          {/* Onglet 4: Laboratoire IA (RESTORED) */}
          <TabsContent value="lab">
            {activeTab === 'lab' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tighter">Suite d'Innovation Vision</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Test et validation des nouveaux algorithmes industriels</p>
                  </div>
                  <Badge className="bg-orange-600/20 text-orange-400 border-none px-4 py-1.5 font-black uppercase text-[10px]">Alpha Lab</Badge>
                </div>
                <InnovationTester innovation={{ id: 7, name: "Panoramic Assembly", requiresData: ["features"], categories: ["assemblage", "vision"], level: 1, description: "Assemblage panoramique", keywords: [], confidence: 1 }} />
              </div>
            )}
          </TabsContent>

          {/* Onglet 5: Cerveau Elite */}
          <TabsContent value="brain">
            {activeTab === 'brain' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="bg-[#2f2f2f] border-white/5 text-white rounded-2xl p-6 md:p-8 col-span-2">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-sm font-black uppercase text-purple-400 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" /> Progression de l'Intelligence
                    </h3>
                    <Badge className="bg-purple-600/20 text-purple-400 border-none px-3 py-1 font-black uppercase text-[10px]">
                      Modèle: {trainingData?.activeBrain?.model || 'Gemma 2 2B'}
                    </Badge>
                  </div>
                  
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                        <XAxis dataKey="name" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '12px' }}
                          itemStyle={{ color: '#a855f7' }}
                        />
                        <Line type="monotone" dataKey="gain" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#a855f7' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Précision Technique</p>
                      <p className="text-xl font-black text-white">{Math.round((trainingData?.activeBrain?.metrics?.technicalPrecision || 0.85) * 100)}%</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Taux d'Hallucination</p>
                      <p className="text-xl font-black text-green-400">{Math.round((trainingData?.activeBrain?.metrics?.hallucinationRate || 0.08) * 100)}%</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Respect Instructions</p>
                      <p className="text-xl font-black text-blue-400">{Math.round((trainingData?.activeBrain?.metrics?.instructionFollowing || 0.92) * 100)}%</p>
                    </div>
                  </div>
                </Card>

                <Card className="bg-[#2f2f2f] border-white/5 text-white rounded-2xl p-6 md:p-8">
                  <h3 className="text-sm font-black uppercase text-blue-400 mb-6 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Pipeline ML Local
                  </h3>
                  <div className="space-y-8">
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Collecte de données</p>
                        <p className="text-xs font-bold text-white">{trainingData?.pipelineStatus?.dataProgress || 0}%</p>
                      </div>
                      <Progress value={trainingData?.pipelineStatus?.dataProgress || 0} className="h-2 bg-white/5" />
                      <p className="text-[9px] text-gray-500 mt-2 italic">
                        Prochain cycle: {trainingData?.pipelineStatus?.nextScheduledCycle || '02:00'}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">État du Système</p>
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", systemHealth?.chromaDB ? "bg-green-500 animate-pulse" : "bg-red-500")} />
                        <span className="text-xs font-bold text-gray-300">ChromaDB: {systemHealth?.chromaDB ? 'Connecté' : 'Hors ligne'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", systemHealth?.ollama ? "bg-green-500" : "bg-red-500")} />
                        <span className="text-xs font-bold text-gray-300">Ollama: {systemHealth?.ollama ? 'Prêt' : 'Indisponible'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", systemHealth?.embeddings ? "bg-green-500" : "bg-yellow-500")} />
                        <span className="text-xs font-bold text-gray-300">Embeddings: {systemHealth?.embeddings ? '768d' : 'Non chargés'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-purple-500" />
                        <span className="text-xs font-bold text-gray-300">Auto-déploiement: Actif</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Documents indexés</span>
                        <span className="text-white font-bold">{trainingData?.documentCount || 0}</span>
                      </div>
                      <div className="flex justify-between text-xs mt-2">
                        <span className="text-gray-500">Leçons apprises</span>
                        <span className="text-purple-400 font-bold">{trainingData?.episodicMemoryCount || 0}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}