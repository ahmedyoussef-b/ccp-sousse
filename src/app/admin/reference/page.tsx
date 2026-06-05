'use client';

import { useState, useEffect } from 'react';
import { VisionNavigation } from '@/components/industrial-vision/VisionNavigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FolderTree, 
  Upload, 
  Database, 
  RefreshCw, 
  Download, 
  Upload as UploadIcon,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Link2,
  Hash,
  Tag
} from 'lucide-react';
import Link from 'next/link';
import { ReferenceEnrichment } from '@/components/reference/ReferenceEnrichment';

export default function ReferencePage() {
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'upload' | 'stats'>('hierarchy');
  const [stats, setStats] = useState({
    zones: 0,
    circuits: 0,
    parametres: 0,
    linkedImages: 0,
    pendingAliases: 0
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Charger les statistiques
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/reference/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  const exportReference = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/reference/export');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reference_constructeur_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur export:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const importReference = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/reference/import', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      if (result.success) {
        await fetchStats();
        window.location.reload();
      }
    } catch (error) {
      console.error('Erreur import:', error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Navigation */}
      <div className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <FolderTree className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Référence Constructeur</h1>
                <p className="text-xs text-gray-500">Gestion de la hiérarchie Zone → Circuit → Paramètre</p>
              </div>
            </div>
            <VisionNavigation currentPage="Référence Industrielle" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Cartes de statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">Zones</p>
                <p className="text-2xl font-bold">{stats.zones}</p>
              </div>
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                <Hash className="h-5 w-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">Circuits</p>
                <p className="text-2xl font-bold">{stats.circuits}</p>
              </div>
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                <Tag className="h-5 w-5 text-green-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">Paramètres</p>
                <p className="text-2xl font-bold">{stats.parametres}</p>
              </div>
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-full">
                <Link2 className="h-5 w-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">Images liées</p>
                <p className="text-2xl font-bold">{stats.linkedImages}</p>
              </div>
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-full">
                <Database className="h-5 w-5 text-indigo-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">Enrichissement</p>
                <p className="text-2xl font-bold">{stats.pendingAliases}</p>
              </div>
              <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-full">
                <BarChart3 className="h-5 w-5 text-amber-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions rapides */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Button 
            variant="outline" 
            size="sm"
            onClick={exportReference}
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Export...' : 'Exporter la référence'}
          </Button>
          
          <label className="cursor-pointer">
            <Button 
              variant="outline" 
              size="sm"
              asChild
              disabled={isImporting}
            >
              <span>
                <UploadIcon className="h-4 w-4 mr-2" />
                {isImporting ? 'Import...' : 'Importer (JSON/Excel)'}
              </span>
            </Button>
            <input 
              type="file" 
              className="hidden" 
              accept=".json,.xlsx,.xls"
              onChange={importReference}
              disabled={isImporting}
            />
          </label>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={fetchStats}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
          
          <Link href="/admin/vision/upload-with-reference" className="ml-auto">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Upload className="h-4 w-4 mr-2" />
              Uploader avec référence
            </Button>
          </Link>
        </div>

        {/* Tabs principaux */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-6">
            <TabsTrigger value="hierarchy" className="gap-2">
              <FolderTree className="h-4 w-4" />
              Hiérarchie
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload avec référence
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Statistiques
            </TabsTrigger>
          </TabsList>

          {/* Onglet Hiérarchie - Affiche le composant principal */}
          <TabsContent value="hierarchy">
            <ReferenceEnrichment />
          </TabsContent>

          {/* Onglet Upload avec référence */}
          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle>Upload d'images avec rattachement</CardTitle>
                <CardDescription>
                  Associez vos images à la hiérarchie Zone / Circuit / Paramètre
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500 text-center py-8">
                  Utilisez le formulaire dédié pour uploader des images
                  <br />
                  <Link href="/admin/vision/upload-with-reference" className="text-blue-600 hover:underline">
                    Aller à la page d'upload →
                  </Link>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Onglet Statistiques détaillées */}
          <TabsContent value="stats">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Répartition par zone</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {['B0', 'B1', 'B2', 'B3', 'A0'].map(zone => (
                      <div key={zone} className="flex items-center justify-between">
                        <span className="font-mono font-bold">{zone}</span>
                        <div className="flex-1 mx-4">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.random() * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm text-gray-500">{Math.floor(Math.random() * 50)} images</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Activité récente</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Nouvelle zone ajoutée</p>
                        <p className="text-xs text-gray-500">Zone B3 - Hier</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">12 images liées</p>
                        <p className="text-xs text-gray-500">Circuit GSE - Il y a 2 jours</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Alias manquants</p>
                        <p className="text-xs text-gray-500">5 circuits sans description</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}