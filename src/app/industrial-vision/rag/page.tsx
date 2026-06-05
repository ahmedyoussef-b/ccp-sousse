// src/app/industrial-vision/rag/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VisionNavigation } from '@/components/industrial-vision/VisionNavigation';
import { ChatWithVision } from '@/components/chat/ChatWithVision';
import { 
  Database, 
  Search, 
  RefreshCw, 
  Image as ImageIcon,
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react';

interface AnalyseItem {
  id: string;
  path: string;
  texteDescriptif: string;
  organes: string[];
  similarite?: {
    bestMatch: string;
    confidence: number;
  };
  dateAnalyse: string;
  score?: number;
}

export default function RagVisionPage() {
  const [analyses, setAnalyses] = useState<AnalyseItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AnalyseItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [stats, setStats] = useState({ 
    total: 0, 
    parEtat: { marche_normale: 0, arret_normale: 0, defaut: 0 } 
  });

  // Charger les analyses
  const loadAnalyses = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/industrial-vision/rag?action=list');
      const data = await response.json();
      if (data.success) {
        setAnalyses(data.analyses || []);
        // Calculer les stats
        const marcheCount = (data.analyses || []).filter((a: AnalyseItem) => a.similarite?.bestMatch === 'marche_normale').length;
        const arretCount = (data.analyses || []).filter((a: AnalyseItem) => a.similarite?.bestMatch === 'arret_normale').length;
        const defautCount = (data.analyses || []).filter((a: AnalyseItem) => a.similarite?.bestMatch === 'defaut').length;
        setStats({
          total: data.analyses?.length || 0,
          parEtat: { marche_normale: marcheCount, arret_normale: arretCount, defaut: defautCount }
        });
      }
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Rechercher
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`/api/industrial-vision/rag?action=search&query=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data.success) {
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error('Erreur recherche:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Scanner la banque d'images
  const scanBank = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/industrial-vision/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Scan terminé: ${data.processed || 0} images traitées, ${data.failed || 0} échecs`);
        await loadAnalyses();
      }
    } catch (error) {
      console.error('Erreur scan:', error);
      alert('Erreur lors du scan');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyses();
  }, []);

  const getEtatBadge = (bestMatch: string) => {
    switch (bestMatch) {
      case 'marche_normale':
        return <Badge className="bg-green-500/10 text-green-600 border-green-200">Marche normale</Badge>;
      case 'arret_normale':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200">Arrêt normal</Badge>;
      case 'defaut':
        return <Badge className="bg-red-500/10 text-red-600 border-red-200">Défaut</Badge>;
      default:
        return <Badge variant="outline">Inconnu</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Navigation - sans parentPages */}
      <VisionNavigation currentPage="RAG Vision" />

      {/* En-tête */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Database className="h-8 w-8 text-purple-500" />
          RAG Vision Industrielle
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Indexation vectorielle et recherche sémantique dans vos analyses industrielles
        </p>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total analyses</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Database className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Marche normale</p>
                <p className="text-2xl font-bold text-green-600">{stats.parEtat.marche_normale}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Arrêt normal</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.parEtat.arret_normale}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Défaut</p>
                <p className="text-2xl font-bold text-red-600">{stats.parEtat.defaut}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="chat">💬 Chat IA avec contexte</TabsTrigger>
          <TabsTrigger value="search">🔍 Recherche sémantique</TabsTrigger>
          <TabsTrigger value="analyses">📊 Analyses indexées</TabsTrigger>
        </TabsList>

        {/* Tab Chat */}
        <TabsContent value="chat">
          <Card className="h-[600px]">
            <ChatWithVision />
          </Card>
        </TabsContent>

        {/* Tab Recherche */}
        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Recherche sémantique
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-6">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ex: 'image avec condenseur en défaut' ou 'pression élevée'"
                  className="flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Rechercher
                </Button>
                <Button variant="outline" onClick={scanBank} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Scanner banque
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-medium">Résultats ({searchResults.length})</h3>
                  {searchResults.map((result, idx) => (
                    <Card key={idx} className="p-4">
                      <div className="flex items-start gap-3">
                        <ImageIcon className="h-8 w-8 text-gray-400" />
                        <div className="flex-1">
                          <p className="font-mono text-sm break-all">{result.path}</p>
                          <p className="text-sm mt-1">{result.texteDescriptif}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">
                              Score: {result.score?.toFixed(2) || 'N/A'}
                            </Badge>
                            {getEtatBadge(result.similarite?.bestMatch || '')}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {searchQuery && searchResults.length === 0 && !isSearching && (
                <div className="text-center py-8 text-gray-500">
                  <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Aucun résultat pour "{searchQuery}"</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Analyses */}
        <TabsContent value="analyses">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Analyses indexées
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  <p className="mt-2 text-gray-500">Chargement...</p>
                </div>
              ) : analyses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Aucune analyse indexée</p>
                  <Button variant="outline" className="mt-4" onClick={scanBank}>
                    Scanner la banque d'images
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  {analyses.map((analysis, idx) => (
                    <div key={idx} className="border-b pb-3">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-sm break-all">{analysis.path}</p>
                        <div className="flex items-center gap-2">
                          {getEtatBadge(analysis.similarite?.bestMatch || '')}
                          <Badge variant="outline" className="text-xs">
                            {new Date(analysis.dateAnalyse).toLocaleDateString()}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm mt-1">{analysis.texteDescriptif}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(analysis.organes || []).slice(0, 5).map((org: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {org}
                          </Badge>
                        ))}
                        {(analysis.organes || []).length > 5 && (
                          <Badge variant="secondary" className="text-xs">
                            +{analysis.organes.length - 5}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}