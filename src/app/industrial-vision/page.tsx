// src/app/industrial-vision/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { VisionNavigation } from '@/components/industrial-vision/VisionNavigation';
import { AnalysisPanel } from '@/components/industrial-vision/AnalysisPanel';
import { TreeViewer } from '@/components/industrial-vision/TreeViewer';
import { ResultsDisplay } from '@/components/industrial-vision/ResultsDisplay';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Microscope,
  Gauge,
  Database,
  Brain,
  TrendingUp,
  Shield,
  FolderTree,
  X,
  Maximize2,
  Cpu  // ← AJOUTÉ pour l'icône Smart Vision
} from 'lucide-react';
import Link from 'next/link';

interface AnalyseResult {
  imageAnalysee: string;
  timestamp: number;
  etatGlobal: 'normal' | 'attention' | 'critique';
  voyantsDetectes: Array<{ organe: string; couleur: string }>;
  mesuresLues: Array<{ organe: string; valeur: number; unite: string }>;
  incoherences: string[];
  tendances: any[];
  evenements: any[];
  similariteReference: {
    marche_normale: number;
    arret_normale: number;
    defaut: number;
    bestMatch: string;
    confidence: number;
  };
  diagnostic: string;
  recommandations: string[];
}

export default function IndustrialVisionDashboard() {
  const [stats, setStats] = useState({ 
    totalReferences: 0, 
    marche: 0, 
    arret: 0, 
    defaut: 0,
    captures: 0
  });
  const [lastAnalysis, setLastAnalysis] = useState<AnalyseResult | null>(null);
  const [isTreeDialogOpen, setIsTreeDialogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Charger les statistiques des références
    fetch('/api/industrial-vision/reference')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStats(prev => ({
            ...prev,
            totalReferences: data.count,
            marche: data.stats?.byType?.marche_normale || 0,
            arret: data.stats?.byType?.arret_normale || 0,
            defaut: data.stats?.byType?.defaut || 0
          }));
        }
      })
      .catch(console.error);
    
    // Charger les statistiques des captures
    fetch('/api/industrial-vision/tree?type=captures&format=simple')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStats(prev => ({ ...prev, captures: data.paths?.length || 0 }));
        }
      })
      .catch(console.error);
  }, []);

  const handleImageAcquired = (result: any) => {
    if (result.success && result.analysis) {
      setLastAnalysis({
        imageAnalysee: result.imagePath || '',
        timestamp: Date.now(),
        etatGlobal: result.analysis.etatGlobal || 'normal',
        voyantsDetectes: result.analysis.voyants || [],
        mesuresLues: result.analysis.cadrans || [],
        incoherences: result.incoherences || [],
        tendances: [],
        evenements: [],
        similariteReference: result.similarity || {
          marche_normale: 0,
          arret_normale: 0,
          defaut: 0,
          bestMatch: 'inconnu',
          confidence: 0
        },
        diagnostic: result.diagnostic || 'Analyse terminée',
        recommandations: result.recommandations || []
      });
    }
  };

  const modules = [
    { title: '40 Innovations IA', desc: '4 niveaux d\'analyse', icon: Gauge, href: '/industrial-vision/innovations', color: 'cyan', badge: '40' },
    { title: 'Références', desc: 'Marche/Arrêt/Défaut', icon: Database, href: '/industrial-vision/references', color: 'emerald', badge: `${stats.totalReferences || 0}` },
    { title: 'RAG Vision', desc: 'Recherche sémantique', icon: Brain, href: '/industrial-vision/rag', color: 'purple', badge: 'IA' },
    { title: 'Analyse temps réel', desc: 'Voyants & cadrans', icon: TrendingUp, href: '/industrial-vision/analyze', color: 'orange', badge: 'Live' },
    // ==================== NOUVEAU BLOC SMART VISION ====================
    { title: 'Smart Vision', desc: '8 IA Pro - SQLite', icon: Cpu, href: '/industrial-vision/innovations-techniques', color: 'purple', badge: '8' }
    // ====================================================================
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <VisionNavigation currentPage="Dashboard" />

      {/* En-tête avec bouton Tree */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Microscope className="h-8 w-8 text-cyan-500" />
            <h1 className="text-3xl font-bold">Vision Industrielle</h1>
            <Badge variant="outline" className="ml-2">Module Expert</Badge>
          </div>
          <p className="text-gray-500 mt-2">
            Analyse intelligente de schémas industriels avec 40 innovations IA
          </p>
        </div>
        
        {/* Bouton d'accès à l'explorateur de fichiers */}
        <Dialog open={isTreeDialogOpen} onOpenChange={setIsTreeDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <FolderTree className="h-4 w-4" />
              Explorateur de fichiers
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {String((stats.totalReferences || 0) + (stats.captures || 0))}
              </Badge>
            </Button>
          </DialogTrigger>
          <DialogContent className={`${isFullscreen ? 'max-w-[95vw] h-[95vh]' : 'max-w-4xl max-h-[80vh]'} overflow-hidden flex flex-col`}>
            <DialogHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <FolderTree className="h-5 w-5 text-cyan-500" />
                  Explorateur de fichiers
                </DialogTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsTreeDialogOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-hidden mt-4">
              <TreeViewer 
                onFileSelect={(path) => {
                  console.log('Fichier sélectionné:', path);
                  setIsTreeDialogOpen(false);
                }}
                showActions={true}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cartes statistiques (5 blocs maintenant) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-4">
            <div><p className="text-sm text-gray-500">Innovations</p><p className="text-2xl font-bold">40</p></div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div><p className="text-sm text-gray-500">Marche normale</p><p className="text-2xl font-bold text-green-600">{stats.marche}</p></div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <div><p className="text-sm text-gray-500">Arrêt normal</p><p className="text-2xl font-bold text-yellow-600">{stats.arret}</p></div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div><p className="text-sm text-gray-500">Défaut</p><p className="text-2xl font-bold text-red-600">{stats.defaut}</p></div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div><p className="text-sm text-gray-500">Smart Vision</p><p className="text-2xl font-bold text-purple-600">8</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Grille modules (MAINTENANT 5 BLOCS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {modules.map((mod) => (
          <Link key={mod.href} href={mod.href}>
            <Card className="hover:shadow-lg transition-all cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <mod.icon className={`h-6 w-6 text-${mod.color}-500`} />
                  <Badge variant="outline" className="text-[10px]">{mod.badge}</Badge>
                </div>
                <h3 className="font-semibold mt-3">{mod.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{mod.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Panel d'analyse et résultats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalysisPanel onImageAcquired={handleImageAcquired} />
        <ResultsDisplay result={lastAnalysis} />
      </div>

      {/* Pipeline info */}
      <Card className="mt-6 bg-gradient-to-r from-cyan-950/20 to-blue-950/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">Pipeline actif</span>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs text-gray-500">
            <div>📁 Banque: data/banque_images_ia/</div>
            <div>📚 Références: {stats.totalReferences} images</div>
            <div>📸 Captures: {stats.captures} images</div>
            <div>🧠 RAG: {(stats.totalReferences || 0) + (stats.captures || 0)} indexées</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}