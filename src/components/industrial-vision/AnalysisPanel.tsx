// src/components/industrial-vision/AnalysisPanel.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, Upload, Loader2, CheckCircle, AlertTriangle, Activity, Gauge, XCircle } from 'lucide-react';

interface AnalysisResult {
  success: boolean;
  image: string;
  path: string;
  diagnostic: string;
  recommandations: string[];
  similarity?: {
    marche_normale: number;
    arret_normale: number;
    defaut: number;
    bestMatch: string;
    confidence: number;
  };
  analysis?: {
    voyants: Array<{ organe: string; couleur: string }>;
    cadrans: Array<{ organe: string; valeur: number; unite: string }>;
  };
  incoherences?: string[];
}

export function AnalysisPanel({}: {onImageAcquired: (result: AnalysisResult) => void}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
      setResult(null);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    
    setIsAnalyzing(true);
    setError(null);
    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('type', 'standard');
    
    try {
      const response = await fetch('/api/industrial-vision/analyze', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'analyse');
      }
      
      setResult(data);
      setActiveTab('results');
    } catch (error) {
      console.error('Erreur:', error);
      setError(error instanceof Error ? error.message : 'Une erreur est survenue');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getEtatColor = (bestMatch?: string) => {
    switch (bestMatch) {
      case 'marche_normale': return 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800';
      case 'arret_normale': return 'bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800';
      case 'defaut': return 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800';
      default: return 'bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700';
    }
  };

  const getEtatIcon = (bestMatch?: string) => {
    switch (bestMatch) {
      case 'marche_normale': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'arret_normale': return <Activity className="h-5 w-5 text-yellow-600" />;
      case 'defaut': return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default: return <Gauge className="h-5 w-5 text-gray-500" />;
    }
  };

  const getEtatLabel = (bestMatch?: string) => {
    switch (bestMatch) {
      case 'marche_normale': return 'Fonctionnement normal';
      case 'arret_normale': return 'Installation à l\'arrêt';
      case 'defaut': return 'État critique - Intervention requise';
      default: return 'État indéterminé';
    }
  };

  const getVoyantColor = (couleur: string) => {
    switch (couleur) {
      case 'vert': return 'bg-green-500';
      case 'jaune': return 'bg-yellow-500';
      case 'rouge': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-cyan-500" />
          Analyse d'image industrielle
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="results" disabled={!result}>Résultats</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                {preview ? (
                  <div className="space-y-4">
                    <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                    <Button variant="outline" onClick={() => {
                      setSelectedFile(null);
                      setPreview(null);
                      setError(null);
                    }}>
                      Changer d'image
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="h-12 w-12 mx-auto text-gray-400" />
                    <p className="text-sm text-gray-500">
                      Glissez-déposez une image ou cliquez pour parcourir
                    </p>
                    <p className="text-xs text-gray-400">
                      Formats supportés: JPG, PNG
                    </p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="image-upload"
                    />
                    <Button asChild variant="outline">
                      <label htmlFor="image-upload" className="cursor-pointer">
                        Parcourir
                      </label>
                    </Button>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-600 text-sm">
                  <XCircle className="h-4 w-4 inline mr-2" />
                  {error}
                </div>
              )}

              {selectedFile && (
                <Button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full">
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      Lancer l'analyse (40 innovations)
                    </>
                  )}
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="results">
            {result && (
              <div className="space-y-6">
                {/* État global - avec vérification de sécurité */}
                <div className={`p-4 rounded-lg ${getEtatColor(result.similarity?.bestMatch)}`}>
                  <div className="flex items-center gap-3">
                    {getEtatIcon(result.similarity?.bestMatch)}
                    <div className="flex-1">
                      <p className="font-medium">
                        {getEtatLabel(result.similarity?.bestMatch)}
                      </p>
                      {result.similarity && (
                        <p className="text-sm opacity-75 mt-1">
                          Confiance: {(result.similarity.confidence * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Diagnostic */}
                {result.diagnostic && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">📋 Diagnostic</p>
                    <p className="text-sm">{result.diagnostic}</p>
                  </div>
                )}

                {/* Similarité avec références - avec vérification de sécurité */}
                {result.similarity && (
                  <div>
                    <p className="text-sm font-medium mb-2">Similarité avec références</p>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs">
                          <span>Marche normale</span>
                          <span>{(result.similarity.marche_normale * 100).toFixed(1)}%</span>
                        </div>
                        <Progress value={result.similarity.marche_normale * 100} className="h-1" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs">
                          <span>Arrêt normal</span>
                          <span>{(result.similarity.arret_normale * 100).toFixed(1)}%</span>
                        </div>
                        <Progress value={result.similarity.arret_normale * 100} className="h-1" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs">
                          <span>Défaut</span>
                          <span>{(result.similarity.defaut * 100).toFixed(1)}%</span>
                        </div>
                        <Progress value={result.similarity.defaut * 100} className="h-1" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Voyants détectés */}
                {result.analysis?.voyants && result.analysis.voyants.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Voyants détectés</p>
                    <div className="flex flex-wrap gap-2">
                      {result.analysis.voyants.map((v, i) => (
                        <Badge key={i} variant="outline" className="gap-1">
                          <div className={`w-2 h-2 rounded-full ${getVoyantColor(v.couleur)}`} />
                          {v.organe}: {v.couleur.toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mesures */}
                {result.analysis?.cadrans && result.analysis.cadrans.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Mesures</p>
                    <div className="grid grid-cols-2 gap-2">
                      {result.analysis.cadrans.map((m, i) => (
                        <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 text-center">
                          <p className="text-xs text-gray-500">{m.organe}</p>
                          <p className="text-lg font-bold">{m.valeur} {m.unite}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Incohérences */}
                {result.incoherences && result.incoherences.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                      ⚠️ Incohérences détectées
                    </p>
                    <ul className="text-xs space-y-1 text-red-500">
                      {result.incoherences.map((inc, i) => (
                        <li key={i}>• {inc}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommandations */}
                {result.recommandations && result.recommandations.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                      📋 Recommandations
                    </p>
                    <ul className="text-xs space-y-1 text-blue-500">
                      {result.recommandations.map((rec, i) => (
                        <li key={i}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}