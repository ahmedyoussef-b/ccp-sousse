'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { VisionNavigation } from '@/components/industrial-vision/VisionNavigation';
import {
  Shield,
  Monitor,
  Scale,
  FolderTree,
  Search,
  Brain,
  Database,
  CheckCircle,
  Cpu,
  Zap,
  Camera,
  ArrowLeft,
  Upload,
  Play,
  History,
  Code,
  BookOpen,
  AlertTriangle,
  X,
  ThumbsUp,
  ThumbsDown,
  Check,
  Loader2
} from 'lucide-react';

// ============================================================================
// DONNÉES DES 8 INNOVATIONS
// ============================================================================


const TECHNICAL_INNOVATIONS = [
  {
    id: 1,
    name: 'Zero-Shot Anomaly',
    fullName: 'Détection d\'anomalies Zero-Shot',
    shortDescription: 'Détecte des anomalies visuelles sans entraînement préalable.',
    description: 'L\'opérateur fournit 2-3 photos de référence d\'un équipement en état normal. Le système extrait les caractéristiques, crée un sous-espace PCA, et détecte toute déviation comme anomalie.',
    icon: Shield,
    color: 'blue',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-400',
    apiEndpoint: '/api/innovations/zero-shot/detect',
    codeExample: 'zeroShotAnomaly.detectAnomaly(imageBuffer, "subspace_id")',
    needsTraining: true,
    stats: { count: 0, metric: 'détections' }
  },
  {
    id: 2,
    name: 'Computer-Use Agent',
    fullName: 'Agent visuel Computer-Use',
    shortDescription: 'Analyse les écrans IHM, détecte alarmes et équipements.',
    description: 'L\'agent peut "voir" l\'écran du logiciel de supervision et analyser l\'état des alarmes, vannes, etc. pour suggérer des actions.',
    icon: Monitor,
    color: 'green',
    bgColor: 'bg-green-500/10',
    textColor: 'text-green-400',
    apiEndpoint: '/api/innovations/computer-use/analyze',
    codeExample: 'computerUseAgent.analyzeScreen(screenshotBuffer)',
    needsTraining: false,
    stats: { count: 0, metric: 'analyses' }
  },
  {
    id: 3,
    name: 'Dual Consensus',
    fullName: 'Double Consensus Vision',
    shortDescription: 'Deux modèles lisent les plaques, validation croisée.',
    description: 'Utiliser deux modèles de vision différents pour lire les plaques signalétiques. Un algorithme de consensus valide les résultats. Confiance >95% si concordance.',
    icon: Scale,
    color: 'purple',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-400',
    apiEndpoint: '/api/innovations/dual-consensus/read',
    codeExample: 'dualConsensusVision.readPlate(imageBuffer)',
    needsTraining: false,
    stats: { count: 0, metric: 'lectures' }
  },
  {
    id: 4,
    name: 'Auto Folder',
    fullName: 'Classification Auto des Dossiers',
    shortDescription: 'Classe automatiquement les images dans le bon dossier.',
    description: 'L\'IA analyse le contenu de l\'image et détermine automatiquement dans quel dossier la classer, sans intervention manuelle.',
    icon: FolderTree,
    color: 'amber',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    apiEndpoint: '/api/innovations/auto-folder/classify',
    codeExample: 'autoFolderClassifier.classifyImage(imageBuffer)',
    needsTraining: false,
    stats: { count: 0, metric: 'classifications' }
  },
  {
    id: 5,
    name: 'Hybrid Search',
    fullName: 'Recherche Hybride Vision/Texte',
    shortDescription: 'Combine recherche visuelle et textuelle.',
    description: 'Combiner la similarité visuelle avec la recherche textuelle (BM25) pour des résultats plus pertinents.',
    icon: Search,
    color: 'cyan',
    bgColor: 'bg-cyan-500/10',
    textColor: 'text-cyan-400',
    apiEndpoint: '/api/innovations/hybrid-search/search',
    codeExample: 'hybridVisionSearch.search({ imageBuffer, textQuery: "vanne" })',
    needsTraining: false,
    stats: { count: 0, metric: 'recherches' }
  },
  {
    id: 6,
    name: 'Few-Shot Trainer',
    fullName: 'Entraînement Few-Shot de Défauts',
    shortDescription: 'Apprenez un défaut avec 5-10 exemples.',
    description: 'Permettre à l\'opérateur d\'apprendre à l\'IA un nouveau défaut visuel en quelques clics, avec 5-10 images d\'exemple.',
    icon: Brain,
    color: 'pink',
    bgColor: 'bg-pink-500/10',
    textColor: 'text-pink-400',
    apiEndpoint: '/api/innovations/few-shot/train',
    codeExample: 'fewShotDefectTrainer.trainDetector(sessionId)',
    needsTraining: true,
    stats: { count: 0, metric: 'modèles' }
  },
  {
    id: 7,
    name: 'Panoramic Stitching',
    fullName: 'Vision Panoramique',
    shortDescription: 'Assemble plusieurs photos en panorama.',
    description: 'Assembler plusieurs images en une vue panoramique pour analyser de grands équipements (tuyauteries, turbines) d\'un seul coup.',
    icon: Camera,
    color: 'orange',
    bgColor: 'bg-orange-500/10',
    textColor: 'text-orange-400',
    apiEndpoint: '/api/innovations/panoramic/stitch',
    codeExample: 'panoramicStitching.stitchPanorama(imageBuffers)',
    needsTraining: false,
    stats: { count: 0, metric: 'panoramas' }
  },
  {
    id: 8,
    name: 'Confidence Feedback',
    fullName: 'Calibration de la Confiance',
    shortDescription: 'Score de fiabilité + feedback utilisateur.',
    description: 'Afficher un score de fiabilité pour chaque prédiction et permettre à l\'opérateur de donner un feedback simple (👍/👎) pour améliorer l\'IA.',
    icon: Zap,
    color: 'emerald',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
    apiEndpoint: '/api/innovations/feedback/record',
    codeExample: 'confidenceFeedback.recordVisionFeedback(predictionId, imageId, score, "confirm")',
    needsTraining: false,
    stats: { count: 0, metric: 'feedbacks' }
  }
];

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function TechnicalInnovationsPage() {
  const [innovations] = useState(TECHNICAL_INNOVATIONS);
  const [selectedInnovation, setSelectedInnovation] = useState<typeof TECHNICAL_INNOVATIONS[0] | null>(null);
  const [activeTab, setActiveTab] = useState('test');
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [, setExistingSubspaces] = useState<any[]>([]);
  
  // États pour Zero-Shot Anomaly
  const [referenceImages, setReferenceImages] = useState<Array<{file: File, preview: string}>>([]);
  const [isCreatingSubspace, setIsCreatingSubspace] = useState(false);
  const [subspaceCreated, setSubspaceCreated] = useState(false);
  const [testImageFile, setTestImageFile] = useState<File | null>(null);
  const [testImagePreview, setTestImagePreview] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<any>(null);
  const [trainingStep, setTrainingStep] = useState(1);

  // États pour les autres innovations
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textQuery, setTextQuery] = useState('');

  useEffect(() => {
    if (selectedInnovation) {
      loadHistory(selectedInnovation.id);
    }
  }, [selectedInnovation]);

  const loadHistory = async (innovationId: number) => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`/api/innovations/history?innovationId=${innovationId}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSelectInnovation = (innovation: typeof TECHNICAL_INNOVATIONS[0]) => {
    setSelectedInnovation(innovation);
    setActiveTab('test');
    // Reset des états spécifiques
    setReferenceImages([]);
    setSubspaceCreated(false);
    setDetectionResult(null);
    setTestImageFile(null);
    setTestImagePreview(null);
    setTestResult(null);
    setSelectedFile(null);
    setTextQuery('');
    setTrainingStep(1);
  };

  const handleBack = () => {
    setSelectedInnovation(null);
  };

  // ==================== ZERO-SHOT ANOMALY FUNCTIONS ====================
  
  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const preview = URL.createObjectURL(file);
      setReferenceImages(prev => [...prev, { file, preview }]);
    }
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const createSubspace = async () => {
    if (referenceImages.length < 2) {
      alert('Veuillez ajouter au moins 2 images de référence');
      return;
    }

    setIsCreatingSubspace(true);
    try {
      const formData = new FormData();
      referenceImages.forEach((img, idx) => {
        formData.append(`image${idx}`, img.file);
      });
      formData.append('name', `subspace_${Date.now()}`);

      const response = await fetch('/api/innovations/zero-shot/create-subspace', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setSubspaceCreated(true);
        setTrainingStep(2);
      } else {
        const error = await response.json();
        alert('Erreur: ' + (error.error || 'Création échouée'));
      }
    } catch (error) {
      console.error('Erreur création sous-espace:', error);
      alert('Erreur lors de la création du modèle');
    } finally {
      setIsCreatingSubspace(false);
    }
  };

  const handleTestImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setTestImageFile(file);
      setTestImagePreview(URL.createObjectURL(file));
      setDetectionResult(null);
    }
  };

  const runDetection = async () => {
    if (!testImageFile) {
      alert('Veuillez charger une image à analyser');
      return;
    }

    setIsDetecting(true);
    try {
      const formData = new FormData();
      formData.append('image', testImageFile);

      const response = await fetch('/api/innovations/zero-shot/detect', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setDetectionResult(data);
    } catch (error) {
      console.error('Erreur détection:', error);
      setDetectionResult({ error: 'Erreur lors de l\'analyse' });
    } finally {
      setIsDetecting(false);
    }
  };
const loadExistingSubspaces = async () => {
  try {
    const response = await fetch('/api/innovations/zero-shot/list-subspaces');
    const data = await response.json();
    if (data.success && data.subspaces.length > 0) {
      setExistingSubspaces(data.subspaces);
      setSubspaceCreated(true);
      setTrainingStep(2);
      console.log('Sous-espaces chargés:', data.subspaces);
    }
  } catch (error) {
    console.error('Erreur chargement sous-espaces:', error);
  }
};

// Appelle cette fonction au montage du composant et après création
useEffect(() => {
  if (selectedInnovation?.id === 1) {
    loadExistingSubspaces();
  }
}, [selectedInnovation]);
  // ==================== TEST GÉNÉRIQUE ====================

  const runGenericTest = async () => {
    if (!selectedInnovation) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('image', selectedFile);
      }
      if (textQuery) {
        formData.append('textQuery', textQuery);
      }

      const response = await fetch(selectedInnovation.apiEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setTestResult(data);
      
      if (response.ok) {
        loadHistory(selectedInnovation.id);
      }
    } catch (error) {
      setTestResult({ error: 'Erreur lors du test' });
    } finally {
      setIsTesting(false);
    }
  };

  // ==================== RENDU ====================
  
  if (!selectedInnovation) {
    // Vue catalogue
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <VisionNavigation currentPage="Smart Vision - 8 IA Pro" />
        
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Cpu className="h-8 w-8 text-purple-500" />
            <h1 className="text-3xl font-bold">Smart Vision</h1>
            <Badge className="bg-purple-500/20 text-purple-400">8 IA Professionnelles</Badge>
          </div>
          <p className="text-gray-400 mt-2">Cliquez sur une innovation pour accéder à son environnement de travail</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {innovations.map((inv) => {
            const Icon = inv.icon;
            return (
              <Card
                key={inv.id}
                className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border border-white/10 bg-gray-800/40 hover:border-purple-500/50"
                onClick={() => handleSelectInnovation(inv)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`h-10 w-10 rounded-xl ${inv.bgColor} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${inv.textColor}`} />
                    </div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">✅ Actif</Badge>
                  </div>
                  <p className="font-semibold text-gray-200">{inv.name}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{inv.shortDescription}</p>
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">{inv.stats.count} {inv.stats.metric}</span>
                      <span className="text-purple-400">Cliquez →</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Vue détail d'une innovation
  const Icon = selectedInnovation.icon;
  const isZeroShot = selectedInnovation.id === 1;
  const isHybridSearch = selectedInnovation.id === 5;
  const isFewShot = selectedInnovation.id === 6;
  const isPanoramic = selectedInnovation.id === 7;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <VisionNavigation currentPage={`Smart Vision - ${selectedInnovation.name}`} />

      {/* Carte de l'innovation sélectionnée */}
      <Card className="mb-6 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-950/30 to-gray-900">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`h-14 w-14 rounded-xl ${selectedInnovation.bgColor} flex items-center justify-center`}>
                <Icon className={`h-7 w-7 ${selectedInnovation.textColor}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">{selectedInnovation.fullName}</h2>
                  <Badge className="bg-green-500/20 text-green-400">✅ Actif</Badge>
                </div>
                <p className="text-gray-400 text-sm mt-1 max-w-2xl">{selectedInnovation.description}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={handleBack} className="gap-2 text-gray-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-gray-800/50 border-white/10">
          <TabsTrigger value="test" className="gap-2"><Play className="h-4 w-4" />Tester</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" />Historique</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2"><BookOpen className="h-4 w-4" />Documentation</TabsTrigger>
        </TabsList>

        {/* ==================== ONGLET TEST ==================== */}
        <TabsContent value="test" className="space-y-4">
          {/* ZERO-SHOT ANOMALY - Interface spéciale en 3 étapes */}
          {isZeroShot && (
            <div className="space-y-6">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span className={trainingStep >= 1 ? 'text-blue-400' : ''}>1. Images référence</span>
                  <span className={trainingStep >= 2 ? 'text-blue-400' : ''}>2. Modèle créé</span>
                  <span className={trainingStep >= 3 ? 'text-blue-400' : ''}>3. Détection</span>
                </div>
                <Progress value={trainingStep === 1 ? 33 : trainingStep === 2 ? 66 : 100} className="h-1" />
              </div>

              {/* Étape 1: Images de référence */}
              <Card className={`border-white/10 ${trainingStep > 1 ? 'bg-gray-800/30' : 'bg-gray-800/40'}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <span className="text-blue-400 font-bold text-sm">1</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-200">Images de référence (état normal)</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    Uploadez 2-3 photos de l'équipement en bon état. L'IA apprendra ce qui est "normal".
                  </p>
                  
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {referenceImages.map((img, idx) => (
                      <div key={idx} className="relative">
                        <div className="aspect-square bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                          <img src={img.preview} alt={`Référence ${idx+1}`} className="w-full h-full object-cover" />
                        </div>
                        <button 
                          onClick={() => removeReferenceImage(idx)}
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {referenceImages.length < 5 && (
                      <label className="aspect-square bg-gray-700/50 rounded-lg border-2 border-dashed border-gray-600 hover:border-blue-500 transition-all flex flex-col items-center justify-center cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />
                        <Upload className="h-6 w-6 text-gray-400" />
                        <span className="text-xs text-gray-500 mt-1">Ajouter</span>
                      </label>
                    )}
                  </div>
                  
                  <Button 
                    onClick={createSubspace}
                    disabled={referenceImages.length < 2 || isCreatingSubspace || subspaceCreated}
                    className="w-full bg-blue-600 hover:bg-blue-500"
                  >
                    {isCreatingSubspace ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Création du modèle...</>
                    ) : subspaceCreated ? (
                      <><Check className="h-4 w-4 mr-2" />Modèle créé !</>
                    ) : (
                      <>✓ Créer le modèle ({referenceImages.length}/2 minimum)</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Étape 2 & 3: Détection (activée si subspaceCreated) */}
              <Card className={`border-white/10 ${!subspaceCreated ? 'opacity-50 pointer-events-none' : 'bg-gray-800/40'}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <span className="text-purple-400 font-bold text-sm">2</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-200">Tester une image</h3>
                  </div>
                  
                  <div className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center hover:border-purple-500/50 transition-all">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleTestImageUpload}
                      className="hidden"
                      id="test-image-input"
                    />
                    <label htmlFor="test-image-input" className="cursor-pointer block">
                      {testImagePreview ? (
                        <img src={testImagePreview} alt="Test" className="max-h-48 mx-auto rounded-lg" />
                      ) : (
                        <>
                          <Camera className="h-12 w-12 text-gray-500 mx-auto mb-2" />
                          <p className="text-gray-400">Cliquez pour charger une image à analyser</p>
                          <p className="text-xs text-gray-600 mt-1">JPG, PNG</p>
                        </>
                      )}
                    </label>
                  </div>
                  
                  <Button
                    onClick={runDetection}
                    disabled={!testImageFile || isDetecting}
                    className="w-full mt-4 gap-2 bg-purple-600 hover:bg-purple-500"
                  >
                    {isDetecting ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyse en cours...</>
                    ) : (
                      <>🚀 Détecter une anomalie</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Résultat */}
              {detectionResult && (
                <Card className={`border-2 ${detectionResult.isAnomaly ? 'border-red-500/50 bg-red-950/20' : 'border-green-500/50 bg-green-950/20'}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${detectionResult.isAnomaly ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                        {detectionResult.isAnomaly ? (
                          <AlertTriangle className="h-6 w-6 text-red-400" />
                        ) : (
                          <CheckCircle className="h-6 w-6 text-green-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold">
                          {detectionResult.isAnomaly ? '⚠️ ANOMALIE DÉTECTÉE' : '✅ ÉQUIPEMENT NORMAL'}
                        </h4>
                        {detectionResult.error ? (
                          <p className="text-red-400 text-sm mt-2">{detectionResult.error}</p>
                        ) : (
                          <>
                            <div className="mt-2 space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-400">Score d'anomalie:</span>
                                <span className={detectionResult.anomalyScore > 0.7 ? 'text-red-400 font-bold' : 'text-green-400'}>
                                  {(detectionResult.anomalyScore * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Seuil:</span>
                                <span>{(detectionResult.threshold * 100).toFixed(1)}%</span>
                              </div>
                            </div>

                            {detectionResult.report && (
                              <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 italic">
                                <p className="font-semibold text-[10px] uppercase text-gray-500 mb-1 tracking-wider">Rapport d'inspection IA :</p>
                                {detectionResult.report}
                              </div>
                            )}

                            <div className="mt-4 flex gap-2">
                              <Button size="sm" variant="outline" className="gap-1 border-green-500/50 text-green-400">
                                <ThumbsUp className="h-3 w-3" /> Confirmer
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1 border-red-500/50 text-red-400">
                                <ThumbsDown className="h-3 w-3" /> Corriger
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* HYBRID SEARCH - Interface avec texte + image */}
          {isHybridSearch && (
            <div className="space-y-4">
              <Card className="border-white/10 bg-gray-800/40">
                <CardContent className="p-5">
                  <h3 className="text-lg font-semibold text-gray-200 mb-4">Recherche hybride</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-400 mb-1 block">Recherche par texte (optionnel)</label>
                      <input
                        type="text"
                        value={textQuery}
                        onChange={(e) => setTextQuery(e.target.value)}
                        placeholder="Ex: pompe, vanne, compresseur..."
                        className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-white focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-400 mb-1 block">Ou recherche par image (optionnel)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        className="w-full text-sm text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded-md file:bg-purple-500/20 file:text-purple-400 file:border-0"
                      />
                    </div>
                    <Button onClick={runGenericTest} disabled={isTesting} className="w-full bg-purple-600 hover:bg-purple-500">
                      {isTesting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Recherche...</> : '🔍 Lancer la recherche'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {testResult && (
                <Card className="border-green-500/50 bg-green-950/20">
                  <CardContent className="p-5">
                    <h3 className="font-semibold mb-2">Résultats ({testResult.count || 0})</h3>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/40 p-3 rounded-lg max-h-96 overflow-auto">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Interface générique pour les autres innovations */}
          {!isZeroShot && !isHybridSearch && !isFewShot && !isPanoramic && (
            <div className="space-y-4">
              <Card className="border-white/10 bg-gray-800/40">
                <CardContent className="p-5">
                  <h3 className="text-lg font-semibold text-gray-200 mb-4">Tester l'innovation</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-400 mb-1 block">Image de test</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        className="w-full text-sm text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded-md file:bg-purple-500/20 file:text-purple-400 file:border-0"
                      />
                    </div>
                    <Button onClick={runGenericTest} disabled={isTesting} className="w-full bg-purple-600 hover:bg-purple-500">
                      {isTesting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyse...</> : '🚀 Lancer l\'analyse'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {testResult && (
                <Card className="border-green-500/50 bg-green-950/20">
                  <CardContent className="p-5">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/40 p-3 rounded-lg">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ==================== ONGLET HISTORIQUE ==================== */}
        <TabsContent value="history">
          <Card className="border-white/10 bg-gray-800/40">
            <CardContent className="p-5">
              <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <Database className="h-5 w-5 text-cyan-400" />
                Historique des analyses (SQLite)
              </h3>
              {isLoadingHistory ? (
                <div className="text-center py-8"><Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto" /></div>
              ) : history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun historique disponible</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {history.map((item, idx) => (
                    <div key={idx} className="p-3 bg-gray-900/50 rounded-lg border border-white/5">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{new Date(item.timestamp).toLocaleString()}</span>
                        <span className={item.success ? 'text-green-400' : 'text-red-400'}>
                          {item.success ? '✅ Succès' : '❌ Échec'}
                        </span>
                      </div>
                      <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                        {JSON.stringify(item.result, null, 2).slice(0, 300)}
                        {JSON.stringify(item.result, null, 2).length > 300 && '...'}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== ONGLET DOCUMENTATION ==================== */}
        <TabsContent value="docs">
          <Card className="border-white/10 bg-gray-800/40">
            <CardContent className="p-5">
              <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <Code className="h-5 w-5 text-purple-400" />
                Documentation technique
              </h3>
              <div className="space-y-4">
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <h4 className="font-medium text-gray-300 mb-2">Endpoint API</h4>
                  <code className="block bg-black/40 p-2 rounded text-cyan-300 text-sm">
                    POST {selectedInnovation.apiEndpoint}
                  </code>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <h4 className="font-medium text-gray-300 mb-2">Format de requête</h4>
                  <code className="block bg-black/40 p-2 rounded text-cyan-300 text-sm">
                    multipart/form-data<br />
                    - image: fichier image (JPG, PNG)
                  </code>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <h4 className="font-medium text-gray-300 mb-2">Code d'intégration</h4>
                  <pre className="bg-black/40 p-2 rounded text-cyan-300 text-xs font-mono overflow-auto">
{`import { ${selectedInnovation.name === 'Zero-Shot Anomaly' ? 'zeroShotAnomaly' : 
  selectedInnovation.name === 'Computer-Use Agent' ? 'computerUseAgent' :
  selectedInnovation.name === 'Dual Consensus' ? 'dualConsensusVision' :
  selectedInnovation.name === 'Auto Folder' ? 'autoFolderClassifier' :
  selectedInnovation.name === 'Hybrid Search' ? 'hybridVisionSearch' :
  selectedInnovation.name === 'Few-Shot Trainer' ? 'fewShotDefectTrainer' :
  selectedInnovation.name === 'Panoramic Stitching' ? 'panoramicStitching' : 'confidenceFeedback'} } from '@/ai/innovations';

const result = await ${selectedInnovation.name === 'Zero-Shot Anomaly' ? 'zeroShotAnomaly.detectAnomaly' :
  selectedInnovation.name === 'Computer-Use Agent' ? 'computerUseAgent.analyzeScreen' :
  selectedInnovation.name === 'Dual Consensus' ? 'dualConsensusVision.readPlate' :
  selectedInnovation.name === 'Auto Folder' ? 'autoFolderClassifier.classifyImage' :
  selectedInnovation.name === 'Hybrid Search' ? 'hybridVisionSearch.search' :
  selectedInnovation.name === 'Few-Shot Trainer' ? 'fewShotDefectTrainer.trainDetector' :
  selectedInnovation.name === 'Panoramic Stitching' ? 'panoramicStitching.stitchPanorama' : 'confidenceFeedback.recordVisionFeedback'}(
  // paramètres selon l'innovation
);`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}