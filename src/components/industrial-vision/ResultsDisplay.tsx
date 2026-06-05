
// src/components/industrial-vision/ResultsDisplay.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle,
  AlertTriangle,
  Activity,
  Gauge,
  TrendingUp,
  FileText,
  Download,
  Share2,
  Eye,
  EyeOff,
  Cpu,
  Database,
  Brain,
  Zap,
  Thermometer,
  Droplets,
  Wind,
  BarChart3,
  LineChart,
  PieChart
} from 'lucide-react';

interface AnalyseResult {
  id?: string;
  imageAnalysee: string;
  timestamp: number;
  etatGlobal: 'normal' | 'attention' | 'critique';
  voyantsDetectes: Array<{ organe: string; couleur: string }>;
  mesuresLues: Array<{ organe: string; valeur: number; unite: string }>;
  incoherences: string[];
  tendances: Array<{ organe: string; tendance: string; pente: number }>;
  evenements: Array<{ type: string; message: string; timestamp: number }>;
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

interface ResultsDisplayProps {
  result: AnalyseResult | null;
  isLoading?: boolean;
  onExport?: (format: 'json' | 'csv' | 'pdf') => void;
  onShare?: () => void;
}

export function ResultsDisplay({ result, isLoading = false, onShare }: ResultsDisplayProps) {
  const [showDetails, setShowDetails] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center space-y-4">
            <div className="animate-spin">
              <Cpu className="h-8 w-8 text-cyan-500 mx-auto" />
            </div>
            <p className="text-gray-500">Analyse en cours...</p>
            <p className="text-xs text-gray-400">40 innovations IA à l'œuvre</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Aucun résultat à afficher</p>
          <p className="text-sm mt-1">Effectuez une analyse pour voir les résultats</p>
        </CardContent>
      </Card>
    );
  }

  const getEtatColor = (etat: string) => {
    switch (etat) {
      case 'normal': return 'text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200';
      case 'attention': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200';
      case 'critique': return 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200';
      default: return 'text-gray-600 bg-gray-50 dark:bg-gray-800/20';
    }
  };

  const getEtatIcon = (etat: string) => {
    switch (etat) {
      case 'normal': return <CheckCircle className="h-6 w-6" />;
      case 'attention': return <AlertTriangle className="h-6 w-6" />;
      case 'critique': return <AlertTriangle className="h-6 w-6" />;
      default: return <Gauge className="h-6 w-6" />;
    }
  };

  const getEtatLabel = (etat: string) => {
    switch (etat) {
      case 'normal': return 'Fonctionnement normal';
      case 'attention': return 'Attention requise';
      case 'critique': return 'État critique';
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

  const getMesureIcon = (unite: string) => {
    switch (unite) {
      case 'bar': return <Droplets className="h-4 w-4" />;
      case '°C': return <Thermometer className="h-4 w-4" />;
      case 'm³/h': return <Wind className="h-4 w-4" />;
      default: return <BarChart3 className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const downloadJSON = () => {
    const dataStr = JSON.stringify(result, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `analyse_${Date.now()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const downloadCSV = () => {
    const voyantsCSV = result.voyantsDetectes.map(v => `${v.organe};${v.couleur}`).join('\n');
    const mesuresCSV = result.mesuresLues.map(m => `${m.organe};${m.valeur};${m.unite}`).join('\n');
    const csv = `Analyse;${formatTimestamp(result.timestamp)}\n\nVOYANTS;\nOrgane;Couleur\n${voyantsCSV}\n\nMESURES;\nOrgane;Valeur;Unité\n${mesuresCSV}\n\nDiagnostic;${result.diagnostic}`;
    
    const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csv);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `analyse_${Date.now()}.csv`);
    linkElement.click();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-500" />
            Résultats d'analyse
            <Badge variant="outline" className="ml-2">
              {new Date(result.timestamp).toLocaleTimeString()}
            </Badge>
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadJSON}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            {onShare && (
              <Button variant="ghost" size="sm" onClick={onShare}>
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Image: {result.imageAnalysee.split('/').pop()}
        </p>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="overview">
              <Gauge className="h-3.5 w-3.5 mr-1" />
              Synthèse
            </TabsTrigger>
            <TabsTrigger value="details">
              <Eye className="h-3.5 w-3.5 mr-1" />
              Détails
            </TabsTrigger>
            <TabsTrigger value="measures">
              <BarChart3 className="h-3.5 w-3.5 mr-1" />
              Mesures
            </TabsTrigger>
            <TabsTrigger value="recommendations">
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              Recommandations
            </TabsTrigger>
          </TabsList>

          {/* Tab Synthèse */}
          <TabsContent value="overview" className="space-y-4">
            {/* État global */}
            <div className={`p-4 rounded-lg ${getEtatColor(result.etatGlobal)}`}>
              <div className="flex items-center gap-3">
                {getEtatIcon(result.etatGlobal)}
                <div className="flex-1">
                  <p className="font-medium">{getEtatLabel(result.etatGlobal)}</p>
                  <p className="text-sm opacity-75 mt-1">{result.diagnostic}</p>
                </div>
              </div>
            </div>

            {/* Similarité avec références */}
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <Database className="h-3.5 w-3.5" />
                Similarité avec références
              </p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs">
                    <span>Marche normale</span>
                    <span>{(result.similariteReference.marche_normale * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={result.similariteReference.marche_normale * 100} className="h-1" />
                </div>
                <div>
                  <div className="flex justify-between text-xs">
                    <span>Arrêt normal</span>
                    <span>{(result.similariteReference.arret_normale * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={result.similariteReference.arret_normale * 100} className="h-1" />
                </div>
                <div>
                  <div className="flex justify-between text-xs">
                    <span>Défaut</span>
                    <span>{(result.similariteReference.defaut * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={result.similariteReference.defaut * 100} className="h-1" />
                </div>
              </div>
            </div>

            {/* Indicateurs clés */}
            {showDetails && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
                    <Eye className="h-3 w-3" />
                    Voyants
                  </div>
                  <p className="text-xl font-bold">
                    {result.voyantsDetectes.filter(v => v.couleur !== 'eteint').length}
                  </p>
                  <p className="text-xs text-gray-500">actifs</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
                    <BarChart3 className="h-3 w-3" />
                    Mesures
                  </div>
                  <p className="text-xl font-bold">{result.mesuresLues.length}</p>
                  <p className="text-xs text-gray-500">capteurs</p>
                </div>
              </div>
            )}

            {/* Incohérences */}
            {result.incoherences.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3">
                <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Incohérences détectées
                </p>
                <ul className="text-xs space-y-1 text-red-500">
                  {result.incoherences.slice(0, 3).map((inc, i) => (
                    <li key={i}>• {inc}</li>
                  ))}
                  {result.incoherences.length > 3 && (
                    <li className="text-gray-500">+{result.incoherences.length - 3} autres</li>
                  )}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Tab Détails */}
          <TabsContent value="details" className="space-y-4">
            {/* Voyants */}
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                Voyants détectés
              </p>
              <div className="grid grid-cols-2 gap-2">
                {result.voyantsDetectes.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className={`w-3 h-3 rounded-full ${getVoyantColor(v.couleur)}`} />
                    <span className="text-sm flex-1">{v.organe}</span>
                    <Badge variant="outline" className="text-xs">
                      {v.couleur.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Mesures détaillées */}
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                Mesures détaillées
              </p>
              <div className="space-y-2">
                {result.mesuresLues.map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {getMesureIcon(m.unite)}
                      <span className="text-sm">{m.organe}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold">{m.valeur}</span>
                      <span className="text-xs text-gray-500">{m.unite}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tendances */}
            {result.tendances.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <LineChart className="h-3.5 w-3.5" />
                  Tendances
                </p>
                <div className="space-y-2">
                  {result.tendances.map((t, i) => {
                    const isHausse = t.tendance === 'hausse';
                    return (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                        <span className="text-sm">{t.organe}</span>
                        <div className="flex items-center gap-2">
                          <TrendingUp className={`h-3.5 w-3.5 ${isHausse ? 'text-red-500' : 'text-green-500'} ${!isHausse && 'rotate-180'}`} />
                          <span className={`text-xs font-mono ${isHausse ? 'text-red-500' : 'text-green-500'}`}>
                            {t.pente > 0 ? '+' : ''}{t.pente.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Événements */}
            {result.evenements.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" />
                  Événements
                </p>
                <div className="space-y-2">
                  {result.evenements.map((e, i) => (
                    <div key={i} className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          {e.type}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(e.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{e.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab Mesures */}
          <TabsContent value="measures" className="space-y-4">
            {/* Graphique des mesures */}
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <PieChart className="h-3.5 w-3.5" />
                Vue d'ensemble des mesures
              </p>
              <div className="space-y-3">
                {result.mesuresLues.map((m, i) => {
                  const maxValue = m.unite === 'bar' ? 16 : (m.unite === '°C' ? 100 : 100);
                  const percentage = (m.valeur / maxValue) * 100;
                  const isWarning = percentage > 80;
                  const isCritical = percentage > 95;
                  
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1">
                          {getMesureIcon(m.unite)}
                          {m.organe}
                        </span>
                        <span className={isCritical ? 'text-red-500 font-bold' : isWarning ? 'text-yellow-500' : ''}>
                          {m.valeur} {m.unite}
                        </span>
                      </div>
                      <Progress 
                        value={percentage} 
                        className={`h-2 ${isCritical ? '[&>div]:bg-red-500' : isWarning ? '[&>div]:bg-yellow-500' : ''}`}
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>0</span>
                        <span>{maxValue / 2}</span>
                        <span>{maxValue}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Statistiques des mesures */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Valeur moyenne</p>
                <p className="text-lg font-mono font-bold">
                  {(result.mesuresLues.reduce((acc, m) => acc + m.valeur, 0) / result.mesuresLues.length || 0).toFixed(1)}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Valeur max</p>
                <p className="text-lg font-mono font-bold">
                  {Math.max(...result.mesuresLues.map(m => m.valeur), 0).toFixed(1)}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Tab Recommandations */}
          <TabsContent value="recommendations" className="space-y-4">
            {result.recommandations.length > 0 ? (
              <div className="space-y-3">
                {result.recommandations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300">
                      {i + 1}
                    </div>
                    <p className="text-sm flex-1">{rec}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Aucune recommandation spécifique</p>
                <p className="text-sm mt-1">L'installation semble fonctionner normalement</p>
              </div>
            )}

            {/* Actions rapides */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Actions rapides</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Imprimer
                </Button>
                <Button variant="outline" size="sm" onClick={downloadJSON}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Exporter JSON
                </Button>
                <Button variant="outline" size="sm" onClick={downloadCSV}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Exporter CSV
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer avec innovations utilisées */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            <span>40 innovations IA</span>
          </div>
          <div className="flex items-center gap-1">
            <Brain className="h-3 w-3" />
            <span>Niveau {result.etatGlobal === 'critique' ? '4' : result.etatGlobal === 'attention' ? '2' : '1'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>Analyse temps réel</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}