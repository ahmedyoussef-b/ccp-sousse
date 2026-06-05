'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VisionNavigation } from '@/components/industrial-vision/VisionNavigation';
import { PanoramicAssemblyModule } from '@/components/industrial-vision/innovations/PanoramicAssemblyModule';
import {
  Search,
  Layers,
  Activity,
  Brain,
  Zap,
  Play,
  Code,
  BookOpen,
  HelpCircle,
  TerminalSquare,
  ChevronRight,
  ImageIcon,
  Settings2
} from 'lucide-react';

import { InnovationGuide } from '@/components/industrial-vision/InnovationGuide';
import { InnovationTester } from '@/components/industrial-vision/InnovationTester';
import { INNOVATIONS_CATALOG } from '@/lib/industrial-vision/innovations/innovation-catalog';

// Données complémentaires (code + exemple de sortie)
const innovationsData: Record<number, {
  code: string;
  example: string;
}> = {
  1: { code: 'indexTextToPosition("CONDENSEUR")', example: '→ (x:150, y:200, w:72, h:30) — confiance: 96%' },
  2: { code: 'detectFamilies(organes)', example: '→ Famille condensation: CONDENSEUR, BP, ATM' },
  3: { code: 'computeSpatialSignature(organes)', example: '→ Vecteur 128D invariant à l\'échelle' },
  4: { code: 'computeVoronoiMask(organes, imageSize)', example: '→ Chaque région associée à un organe' },
  5: { code: 'crossModalSearch("truc qui refroidit")', example: '→ CONDENSEUR (score: 0.87)' },
  6: { code: 'detectAnomalies(current, reference)', example: '→ Organes manquants: BALLON PURGES' },
  7: { code: 'generateAltText(organes, voyants)', example: '→ Schéma montrant CONDENSEUR, CIRCUIT HP...' },
  8: { code: 'detectMissingOrgans(current, reference)', example: '→ Il manque: FLUIDE REGULATION' },
  9: { code: 'generateInteractiveMap(organes)', example: '→ carte_interactive.html générée' },
  10: { code: 'semanticVersioning(schemaA, schemaB)', example: '→ minor_change détecté' },
  11: { code: 'detectFunctionalRedundancy(organes)', example: '→ 3 BALLON PURGES identiques' },
  12: { code: 'inferHierarchy(organes)', example: '→ CONDENSEUR → BP, ATM' },
  13: { code: 'detectSpatialPatterns(organes)', example: '→ 3 ballons alignés sur axe Y' },
  14: { code: 'inferFlowDirection(circuits)', example: '→ CIRCUIT HP: flux montant 35°' },
  15: { code: 'detectAnchors(organes)', example: '→ ATM et CONDENSEUR sont fixes' },
  16: { code: 'extractTopologicalConstraints(organes)', example: '→ ATM jamais proche CIRCUIT HP' },
  17: { code: 'inferDepth(organes, context)', example: '→ BP en Z=0.9 (arrière-plan)' },
  18: { code: 'detectGhostOrgans(image, organes)', example: '→ Région suspecte sans texte détectée' },
  19: { code: 'computeCognitiveLoad(organes, layout)', example: '→ Score: 0.65 → Dense' },
  20: { code: 'generateQuiz(organes)', example: '→ Q: Où se trouve CONDENSEUR ?' },
  21: { code: 'computeStylometry(image)', example: '→ Signature unique du dessinateur' },
  22: { code: 'predictReadingOrder(organes)', example: '→ CONDENSEUR → CIRCUIT HP → BP' },
  23: { code: 'detectNonsense(circuits, physique)', example: '→ Liquide qui monte sans pompe' },
  24: { code: 'semanticCompression(organes, context)', example: '→ 5 concepts principaux extraits' },
  25: { code: 'computeScale(image, referenceLength)', example: '→ 1 pixel = 0.15mm' },
  26: { code: 'computeCriticality(organes, graph)', example: '→ CONDENSEUR: criticité 0.92' },
  27: { code: 'editDistance(schemaA, schemaB)', example: '→ 0.3 → variante proche' },
  28: { code: 'generateLegend(organes)', example: '→ 1. CONDENSEUR, 2. CIRCUIT HP' },
  29: { code: 'detectLoops(circuits)', example: '→ Boucle A→B→A détectée' },
  30: { code: 'estimateEra(image, style)', example: '→ Années 1990 (traits épais)' },
  31: { code: 'detectVoyantChange(videoStream, rois)', example: '→ ALARME: CONDENSEUR → ROUGE' },
  32: { code: 'readCadran(image, cadranRoi)', example: '→ 7.5 bar (confiance: 94%)' },
  33: { code: 'detectIncoherences(voyants, cadrans)', example: '→ VERT mais pression nulle !' },
  34: { code: 'predictTrend(cadranHistory)', example: '→ Hausse de 0.5 bar/s' },
  35: { code: 'detectCycles(voyantHistory)', example: '→ Cycle VERT→JAUNE→ROUGE anormal' },
  36: { code: 'correlate(cadranA, cadranB, lag)', example: '→ HP anticipe CONDENSEUR de 3s' },
  37: { code: 'detectDrift(cadranHistory, window)', example: '→ +0.1°C/heure (dérive lente)' },
  38: { code: 'generateTimeline(events)', example: '→ timeline_interactive.html générée' },
  39: { code: 'generateIncidentReport(analysis)', example: '→ rapport_incident_2024.txt créé' },
  40: { code: 'generateRealtimeDashboard(streams)', example: '→ dashboard.html en temps réel' }
};

// Innovation spéciale pour l'assemblage panoramique (niveau 2 - Structural)
const PANORAMIC_INNOVATION = {
  id: 7,
  name: 'Assemblage Panoramique',
  description: 'Assemblez plusieurs images partielles en une image globale parfaite. Supporte le positionnement manuel drag & drop, rotation, redimensionnement et snapping.',
  level: 2,
  categories: ['vision', 'assemblage', 'panorama'],
  requiresData: ['images', 'positions', 'rotation']
};

const levelConfig: Record<number, { name: string; icon: any; color: string; bgColor: string; textColor: string }> = {
  1: { name: 'Fonctionnel', icon: Layers, color: 'blue', bgColor: 'bg-blue-500/10', textColor: 'text-blue-400' },
  2: { name: 'Structural', icon: Activity, color: 'green', bgColor: 'bg-green-500/10', textColor: 'text-green-400' },
  3: { name: 'Cognitif', icon: Brain, color: 'purple', bgColor: 'bg-purple-500/10', textColor: 'text-purple-400' },
  4: { name: 'Dynamique', icon: Zap, color: 'orange', bgColor: 'bg-orange-500/10', textColor: 'text-orange-400' }
};

type ViewMode = 'catalog' | 'guide' | 'tester' | 'panoramic';

export default function InnovationsPage() {
  const [search, setSearch] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [selectedInnovationId, setSelectedInnovationId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
const [activeTab, setActiveTab] = useState<'innovations' | 'panoramic'>('panoramic');
  const innovations = INNOVATIONS_CATALOG;

  const filteredInnovations = innovations.filter((inv) => {
    const matchesSearch = inv.name.toLowerCase().includes(search.toLowerCase()) ||
                          inv.description.toLowerCase().includes(search.toLowerCase());
    const matchesLevel = selectedLevel === null || inv.level === selectedLevel;
    return matchesSearch && matchesLevel;
  });

  const selectedInnovation = selectedInnovationId
    ? innovations.find(inv => inv.id === selectedInnovationId)
    : null;

  const selectInnovation = (id: number) => {
    setSelectedInnovationId(id);
    setViewMode('catalog');
    setTimeout(() => {
      document.getElementById('innovation-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Helper pour obtenir les données d'innovation (avec fallback)
  const getInnovationData = (id: number) => {
    return innovationsData[id] || { code: `${innovations.find(i => i.id === id)?.name.replace(/\s+/g, '')}()`, example: 'Extraction automatisée des données industrielles.' };
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <VisionNavigation currentPage="Innovations IA" />

      {/* Tabs pour basculer entre Catalogue et Assemblage */}
      <div className="mb-6">
<Tabs defaultValue="panoramic" value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">          <TabsList className="grid w-full max-w-md grid-cols-2 bg-gray-800/50">
            <TabsTrigger value="innovations" className="gap-2">
              <Layers className="h-4 w-4" />
              Catalogue des Innovations
            </TabsTrigger>
            <TabsTrigger value="panoramic" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Assemblage Panoramique
            </TabsTrigger>
          </TabsList>

          {/* Onglet Catalogue des Innovations */}
          <TabsContent value="innovations" className="mt-4">
            <div className="mb-8">
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Layers className="h-8 w-8 text-blue-500" />
                Catalogue des Innovations
              </h1>
              <p className="text-gray-400 mt-2">
                40 innovations IA — Cliquez sur une innovation pour l&apos;explorer et l&apos;exploiter
              </p>
            </div>

            {/* Barre de recherche et filtres */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1 group">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-blue-500 transition-colors group-focus-within:text-cyan-400" />
                <Input
                  placeholder="Rechercher parmi les 40 innovations (ex: localisation, flux, diagnostic)..."
                  className="pl-10 text-white bg-gray-900/60 border-white/10 placeholder:text-gray-600 focus-visible:ring-blue-500/50 h-12 rounded-xl transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedLevel === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLevel(null)}
                >
                  Tous (40)
                </Button>
                {[1, 2, 3, 4].map(level => {
                  const config = levelConfig[level];
                  const Icon = config.icon;
                  return (
                    <Button
                      key={level}
                      variant={selectedLevel === level ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedLevel(level)}
                      className="gap-1"
                    >
                      <Icon className="h-3 w-3" />
                      {config.name}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Grille des innovations */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              {filteredInnovations.map((inv) => {
                const config = levelConfig[inv.level];
                const Icon = config.icon;
                const isSelected = selectedInnovationId === inv.id;
                return (
                  <Card
                    key={inv.id}
                    className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 group border ${
                      isSelected
                        ? 'ring-2 ring-blue-500 border-blue-500/50 bg-blue-950/20'
                        : 'border-white/10 bg-gray-800/40 hover:border-white/20'
                    }`}
                    onClick={() => selectInnovation(inv.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-6 w-6 rounded-md ${config.bgColor} flex items-center justify-center`}>
                            <Icon className={`h-3.5 w-3.5 ${config.textColor}`} />
                          </div>
                          <Badge variant="outline" className="text-[10px] border-white/10 text-gray-400">#{inv.id}</Badge>
                        </div>
                        <ChevronRight className={`h-3.5 w-3.5 text-gray-500 transition-transform ${isSelected ? 'rotate-90 text-blue-400' : 'group-hover:translate-x-0.5'}`} />
                      </div>
                      <p className={`font-medium text-xs leading-tight ${isSelected ? 'text-blue-300' : 'text-gray-200'}`}>
                        {inv.name}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{inv.description}</p>
                      <div className="mt-2">
                        <Badge className={`text-[10px] ${config.bgColor} ${config.textColor} border-0`}>
                          {config.name}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Panneau détail */}
            {selectedInnovation && (
              <div id="innovation-detail" className="mb-8">
                <div className="flex items-center gap-1 mb-4 p-1 bg-gray-800/50 rounded-xl border border-white/10 w-fit">
                  <button
                    onClick={() => setViewMode('catalog')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      viewMode === 'catalog'
                        ? 'bg-gray-700 text-white shadow-md'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <BookOpen className="h-4 w-4" />
                    Fiche détail
                  </button>
                  <button
                    onClick={() => setViewMode('tester')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      viewMode === 'tester'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <TerminalSquare className="h-4 w-4" />
                    Tester l&apos;IA
                  </button>
                  <button
                    onClick={() => setViewMode('guide')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      viewMode === 'guide'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <HelpCircle className="h-4 w-4" />
                    Guide pas-à-pas
                  </button>
                </div>

                {viewMode === 'catalog' && (
                  <Card className="border border-white/10 bg-gray-800/40 shadow-lg">
                    <CardHeader className="border-b border-white/10">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`${levelConfig[selectedInnovation.level].bgColor} ${levelConfig[selectedInnovation.level].textColor} border-0`}>
                              Niveau {selectedInnovation.level} — {levelConfig[selectedInnovation.level].name}
                            </Badge>
                            <Badge variant="outline" className="border-white/10 text-gray-400">#{selectedInnovation.id}</Badge>
                          </div>
                          <CardTitle className="text-xl text-gray-100">{selectedInnovation.name}</CardTitle>
                          <CardDescription className="mt-1 text-gray-400">{selectedInnovation.description}</CardDescription>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewMode('guide')}
                            className="gap-2 border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10"
                          >
                            <HelpCircle className="h-4 w-4" />
                            Guide
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setViewMode('tester')}
                            className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
                          >
                            <Play className="h-4 w-4 fill-current" />
                            Tester l&apos;IA
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2 flex items-center gap-1.5">
                            <Code className="h-3.5 w-3.5" />
                            Implémentation Technique
                          </h4>
                          <code className="block bg-black/40 border border-white/10 p-3 rounded-lg text-xs font-mono text-cyan-300">
                            {getInnovationData(selectedInnovation.id).code}
                          </code>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2">Données Requises</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedInnovation.requiresData.map(data => (
                              <Badge key={data} variant="secondary" className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px]">
                                {data}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2 flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5" />
                            Résultat Attendu
                          </h4>
                          <div className="bg-green-950/30 border border-green-500/20 p-3 rounded-lg">
                            <p className="text-sm text-green-300 font-mono text-xs">
                              {getInnovationData(selectedInnovation.id).example}
                            </p>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2">Catégories</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedInnovation.categories.map(cat => (
                              <Badge key={cat} variant="outline" className="border-white/10 text-gray-400 capitalize text-[11px]">{cat}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {viewMode === 'tester' && (
                  <InnovationTester
                    innovation={selectedInnovation}
                    innovationCode={getInnovationData(selectedInnovation.id).code}
                    innovationExample={getInnovationData(selectedInnovation.id).example}
                  />
                )}

                {viewMode === 'guide' && (
                  <InnovationGuide
                    innovation={selectedInnovation}
                    onClose={() => setViewMode('catalog')}
                  />
                )}
              </div>
            )}

            {/* Statistiques */}
            <div className="mt-6 p-4 bg-gray-800/40 rounded-xl border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Total des innovations</p>
                  <p className="text-2xl font-bold text-white">40</p>
                </div>
                <div className="flex gap-6">
                  {[1, 2, 3, 4].map(level => {
                    const c = levelConfig[level];
                    return (
                      <div key={level} className="text-center">
                        <p className="text-xs text-gray-500">{c.name}</p>
                        <p className={`text-lg font-bold ${c.textColor}`}>10</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Onglet Assemblage Panoramique */}
          <TabsContent value="panoramic" className="mt-4">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
                  <ImageIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Assemblage Panoramique</h2>
                  <p className="text-gray-400 text-sm">
                    Innovation #7 — Assemblez plusieurs images en un panorama. Mode automatique ou positionnement manuel (drag & drop, rotation, redimensionnement).
                  </p>
                </div>
              </div>
            </div>
            
            {/* Module d'assemblage panoramique complet */}
            <div className="h-[calc(100vh-280px)] min-h-[600px] border border-white/10 rounded-xl overflow-hidden">
              <PanoramicAssemblyModule />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}