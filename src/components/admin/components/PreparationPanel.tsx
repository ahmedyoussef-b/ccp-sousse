// src/components/admin/components/PreparationPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Brain,
  Target,
  GitBranch,
  Layers,
  Sparkles,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

interface PreparationPanelProps {
  imageId: string;
  imageName: string;
  onComplete?: () => void;
}

interface PreparationStatus {
  imageId: string;
  prepared: boolean;
  status: 'not_started' | 'pending' | 'processing' | 'completed' | 'failed';
  preparationDate?: number;
  data?: {
    rois?: Array<{ type: string; bbox: any; importance: number; confidence: number; label?: string }>;
    anchors?: Array<{ id: string; type: string; position: any; size: { width: number; height: number }; confidence: number }>;
    spatialHierarchy?: { components: any[]; relations: any[] };
    pyramidLevels?: Array<{ scale: number; size: number }>;
  };
  logs?: Array<{
    operation: string;
    status: string;
    details: string;
    duration_ms: number;
    created_at: number;
  }>;
}

export function PreparationPanel({ imageId, imageName, onComplete }: PreparationPanelProps) {
  const [status, setStatus] = useState<PreparationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'rois' | 'anchors' | 'hierarchy' | 'logs'>('overview');
  const { toast } = useToast();

  useEffect(() => {
    loadStatus();
  }, [imageId]);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/vision/prepare?imageId=${imageId}`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Erreur chargement statut:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startPreparation = async () => {
    setIsPreparing(true);
    toast({
      title: "🧠 Préparation IA",
      description: "Analyse et préparation de l'image en cours...",
    });

    try {
      const response = await fetch('/api/vision/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, options: { forceRefresh: true } })
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "✅ Préparation terminée",
          description: result.message,
        });
        await loadStatus();
        onComplete?.();
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        title: "❌ Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsPreparing(false);
    }
  };

  const deletePreparation = async () => {
    try {
      const response = await fetch(`/api/vision/prepare?imageId=${imageId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: "🗑️ Préparations supprimées",
          description: "Les préparations de l'image ont été supprimées",
        });
        await loadStatus();
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
    }
  };

  const getStatusBadge = () => {
    if (!status) return null;
    
    switch (status.status) {
      case 'completed':
        return <Badge className="bg-green-600/20 text-green-400 border-green-500/30">✅ Préparée</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-500/30">🔄 En cours</Badge>;
      case 'failed':
        return <Badge className="bg-red-600/20 text-red-400 border-red-500/30">❌ Échec</Badge>;
      default:
        return <Badge className="bg-gray-600/20 text-gray-400 border-gray-500/30">⏳ Non préparée</Badge>;
    }
  };

  const getProgressValue = () => {
    if (!status?.data) return 0;
    let completed = 0;
    let total = 4;
    if (status.data.rois?.length) completed++;
    if (status.data.anchors?.length) completed++;
    if (status.data.spatialHierarchy) completed++;
    if (status.data.pyramidLevels?.length) completed++;
    return (completed / total) * 100;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto mb-4" />
          <p className="text-gray-500">Chargement des préparations...</p>
        </div>
      </div>
    );
  }

  const isPrepared = status?.status === 'completed';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Préparations IA
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {imageName}
          </p>
        </div>
        <div className="flex gap-2">
          {getStatusBadge()}
        </div>
      </div>

      {/* Progress */}
      {status?.status === 'processing' && (
        <div className="p-4 bg-yellow-600/10 border border-yellow-500/20 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
            <span className="text-sm text-yellow-400">Préparation en cours...</span>
          </div>
          <Progress value={getProgressValue()} className="h-1" />
        </div>
      )}

      {status?.status === 'completed' && (
        <div className="p-4 bg-green-600/10 border border-green-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400">Image préparée avec succès</span>
          </div>
          {status.preparationDate && (
            <p className="text-xs text-gray-500 mt-2">
              Préparée le {new Date(status.preparationDate).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {!isPrepared && (
          <Button
            onClick={startPreparation}
            disabled={isPreparing}
            className="bg-purple-600 hover:bg-purple-500 gap-2"
          >
            {isPreparing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Préparation en cours...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Lancer la préparation IA</>
            )}
          </Button>
        )}
        {isPrepared && (
          <Button
            onClick={deletePreparation}
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-600/10 gap-2"
          >
            <XCircle className="w-4 h-4" /> Supprimer les préparations
          </Button>
        )}
      </div>

      {/* Detailed tabs */}
      {isPrepared && status?.data && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-6">
          <TabsList className="bg-gray-800/50 border-white/10">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Vue d'ensemble
            </TabsTrigger>
            <TabsTrigger value="rois" className="gap-2">
              <Target className="w-4 h-4" />
              ROI ({status.data.rois?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="anchors" className="gap-2">
              <MapPin className="w-4 h-4" />
              Ancres ({status.data.anchors?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="hierarchy" className="gap-2">
              <GitBranch className="w-4 h-4" />
              Hiérarchie
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Clock className="w-4 h-4" />
              Logs
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4 text-center">
                  <Target className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold">{status.data.rois?.length || 0}</p>
                  <p className="text-xs text-gray-500">Régions d'intérêt</p>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4 text-center">
                  <MapPin className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold">{status.data.anchors?.length || 0}</p>
                  <p className="text-xs text-gray-500">Points d'ancrage</p>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4 text-center">
                  <GitBranch className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold">{status.data.spatialHierarchy?.relations?.length || 0}</p>
                  <p className="text-xs text-gray-500">Relations spatiales</p>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4 text-center">
                  <Layers className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold">{status.data.pyramidLevels?.length || 0}</p>
                  <p className="text-xs text-gray-500">Niveaux de résolution</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ROI Tab */}
          <TabsContent value="rois" className="mt-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-lg">Régions d'intérêt détectées</CardTitle>
                <CardDescription>
                  Zones importantes identifiées dans l'image (alarmes, vannes, pompes...)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {status.data.rois && status.data.rois.length > 0 ? (
                  <div className="space-y-3">
                    {status.data.rois.map((roi, idx) => (
                      <div key={idx} className="p-3 bg-black/40 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-600/20 text-blue-400">
                              {roi.type}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              Confiance: {Math.round(roi.confidence * 100)}%
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[9px]">
                            Importance: {roi.importance}
                          </Badge>
                        </div>
                        {roi.label && (
                          <p className="text-sm text-gray-300 mt-1">🏷️ {roi.label}</p>
                        )}
                        <p className="text-xs text-gray-600 mt-2 font-mono">
                          Position: ({roi.bbox.x}, {roi.bbox.y}) - {roi.bbox.width}x{roi.bbox.height}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">Aucune région d'intérêt détectée</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Anchors Tab */}
          <TabsContent value="anchors" className="mt-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-lg">Points d'ancrage</CardTitle>
                <CardDescription>
                  Points de référence uniques (QR codes, logos, formes distinctives)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {status.data.anchors && status.data.anchors.length > 0 ? (
                  <div className="space-y-3">
                    {status.data.anchors.map((anchor, idx) => (
                      <div key={idx} className="p-3 bg-black/40 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-purple-600/20 text-purple-400">
                              {anchor.type}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              ID: {anchor.id}
                            </span>
                          </div>
                          <span className="text-xs text-green-400">
                            Confiance: {Math.round(anchor.confidence * 100)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-2 font-mono">
                          Position: ({anchor.position.x}, {anchor.position.y}) - {anchor.size.width}x{anchor.size.height}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">Aucun point d'ancrage détecté</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hierarchy Tab */}
          <TabsContent value="hierarchy" className="mt-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-lg">Hiérarchie spatiale</CardTitle>
                <CardDescription>
                  Relations spatiales entre les composants détectés
                </CardDescription>
              </CardHeader>
              <CardContent>
                {status.data.spatialHierarchy ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-300 mb-2">Composants ({status.data.spatialHierarchy.components?.length || 0})</h4>
                      <div className="space-y-2">
                        {status.data.spatialHierarchy.components?.map((comp: any, idx: number) => (
                          <div key={idx} className="p-2 bg-black/40 rounded-lg flex items-center gap-2">
                            <Badge className="bg-gray-600/20">{comp.type}</Badge>
                            <span className="text-xs text-gray-400">ID: {comp.id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-300 mb-2">Relations ({status.data.spatialHierarchy.relations?.length || 0})</h4>
                      <div className="space-y-2">
                        {status.data.spatialHierarchy.relations?.map((rel: any, idx: number) => (
                          <div key={idx} className="p-2 bg-black/40 rounded-lg flex items-center gap-2 text-sm">
                            <span className="text-purple-400">{rel.from}</span>
                            <span className="text-gray-500">→</span>
                            <span className="text-cyan-400">{rel.to}</span>
                            <Badge variant="outline" className="text-[9px] ml-auto">
                              {rel.direction} ({Math.round(rel.distance)}px)
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">Aucune hiérarchie spatiale générée</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="mt-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-lg">Journal des opérations</CardTitle>
                <CardDescription>
                  Historique des actions de préparation
                </CardDescription>
              </CardHeader>
              <CardContent>
                {status.logs && status.logs.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                    {status.logs.map((log, idx) => (
                      <div key={idx} className="p-3 bg-black/40 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono text-purple-400">{log.operation}</span>
                          <div className="flex items-center gap-2">
                            {log.duration_ms && (
                              <span className="text-[9px] text-gray-500">{log.duration_ms}ms</span>
                            )}
                            <Badge className={`text-[9px] ${log.status === 'success' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                              {log.status}
                            </Badge>
                          </div>
                        </div>
                        {log.details && (
                          <p className="text-xs text-gray-500">{log.details}</p>
                        )}
                        <p className="text-[9px] text-gray-600 mt-1">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">Aucune opération enregistrée</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}