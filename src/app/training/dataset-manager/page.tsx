// app/training/dataset-manager/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  FolderTree,
  FileJson,
  FolderOpen,
  Plus,
  Trash2,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  FileText,
  Database,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  children?: FileNode[];
}

interface DatasetStats {
  totalFiles: number;
  totalSize: string;
  examplesCount: number;
  lastPrepared: string | null;
}

export default function DatasetManagerPage() {
  const { toast } = useToast();
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [stats, setStats] = useState<DatasetStats>({
    totalFiles: 0,
    totalSize: '0 KB',
    examplesCount: 0,
    lastPrepared: null
  });
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState(0);
  const [newFolderName, setNewFolderName] = useState('');
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Charger l'arborescence
  useEffect(() => {
    loadTree();
    loadStats();
  }, []);

  const loadTree = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/training/dataset/tree');
      if (response.ok) {
        const data = await response.json();
        setTreeData(data.tree || []);
      } else {
        throw new Error('Failed to load tree');
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger l\'arborescence',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/training/dataset/stats');
      if (response.ok) {
        const data = await response.json();
        setStats({
          totalFiles: data.totalFiles || 0,
          totalSize: data.totalSize || '0 KB',
          examplesCount: data.examples || 0,
          lastPrepared: data.lastPrepared || null
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch('/api/training/dataset/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          path: selectedPath || 'data/training',
          name: newFolderName 
        })
      });

      if (response.ok) {
        toast({ title: 'Dossier créé', description: `${newFolderName} a été créé` });
        loadTree();
        setIsNewFolderDialogOpen(false);
        setNewFolderName('');
      } else {
        throw new Error('Failed to create folder');
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de créer le dossier',
        variant: 'destructive',
      });
    }
  };

  const deleteItem = async () => {
    if (!selectedPath) return;

    try {
      const response = await fetch('/api/training/dataset/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath })
      });

      if (response.ok) {
        toast({ title: 'Supprimé', description: `L'élément a été supprimé` });
        loadTree();
        loadStats();
        setIsDeleteDialogOpen(false);
        setSelectedPath(null);
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer l\'élément',
        variant: 'destructive',
      });
    }
  };

  const prepareDataset = async () => {
    setIsPreparing(true);
    setPrepareProgress(0);

    try {
      // Simulation de progression
      const interval = setInterval(() => {
        setPrepareProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const response = await fetch('/api/training/dataset/prepare', {
        method: 'POST'
      });

      clearInterval(interval);
      setPrepareProgress(100);

      if (response.ok) {
        const data = await response.json();
        toast({
          title: '✅ Dataset préparé',
          description: `${data.examplesCount} exemples prêts pour l'entraînement`,
        });
        loadStats();
      } else {
        throw new Error('Preparation failed');
      }
    } catch (error) {
      toast({
        title: '❌ Erreur',
        description: 'Échec de la préparation du dataset',
        variant: 'destructive',
      });
    } finally {
      setIsPreparing(false);
      setTimeout(() => setPrepareProgress(0), 2000);
    }
  };

  const renderTree = (nodes: FileNode[], level: number = 0) => {
    return nodes.map((node) => (
      <div key={node.path} style={{ marginLeft: level * 20 }}>
        <div
          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-slate-800/50 transition-colors ${
            selectedPath === node.path ? 'bg-slate-800/70 ring-1 ring-emerald-500/50' : ''
          }`}
          onClick={() => setSelectedPath(node.path)}
        >
          {node.type === 'directory' ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.path);
                }}
                className="p-0.5 hover:bg-slate-700 rounded"
              >
                {expandedPaths.has(node.path) ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>
              <FolderOpen className="w-4 h-4 text-emerald-400" />
            </>
          ) : (
            <>
              <div className="w-5" />
              {node.name.endsWith('.json') || node.name.endsWith('.jsonl') ? (
                <FileJson className="w-4 h-4 text-blue-400" />
              ) : (
                <FileText className="w-4 h-4 text-slate-400" />
              )}
            </>
          )}
          <span className="text-sm text-slate-300">{node.name}</span>
          {node.type === 'file' && node.size && (
            <span className="text-xs text-slate-500 ml-auto">
              {(node.size / 1024).toFixed(1)} KB
            </span>
          )}
        </div>
        {node.type === 'directory' && expandedPaths.has(node.path) && node.children && (
          <div className="mt-1">
            {renderTree(node.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FolderTree className="w-6 h-6 text-emerald-400" />
              Gestionnaire du Dataset
            </h1>
            <p className="text-slate-400 mt-1">
              Gérez l'arborescence des données d'entraînement
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/training?tab=manual'}
            className="border-slate-700"
          >
            ← Retour
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panneau de gauche - Arborescence */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-emerald-400" />
                    Arborescence du Dataset
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadTree}
                      className="border-slate-700"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Rafraîchir
                    </Button>
                    <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                          <Plus className="w-4 h-4 mr-2" />
                          Nouveau dossier
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                          <DialogTitle>Créer un nouveau dossier</DialogTitle>
                          <DialogDescription>
                            {selectedPath 
                              ? `Dossier parent: ${selectedPath}`
                              : 'Dossier: data/training'}
                          </DialogDescription>
                        </DialogHeader>
                        <Input
                          placeholder="Nom du dossier"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          className="bg-slate-800 border-slate-700"
                        />
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsNewFolderDialogOpen(false)}>
                            Annuler
                          </Button>
                          <Button onClick={createFolder} className="bg-emerald-600">
                            Créer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <CardDescription>
                  Structure des fichiers et dossiers d'entraînement
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                  </div>
                ) : treeData.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Aucun dossier trouvé</p>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto space-y-1">
                    {renderTree(treeData)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions sur fichier sélectionné */}
            {selectedPath && (
              <Card className="border-slate-800 bg-slate-900/50">
                <CardHeader>
                  <CardTitle className="text-base">Actions sur la sélection</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Supprimer
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                          <DialogTitle>Confirmer la suppression</DialogTitle>
                          <DialogDescription>
                            Êtes-vous sûr de vouloir supprimer "{selectedPath}" ?
                            Cette action est irréversible.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                            Annuler
                          </Button>
                          <Button variant="destructive" onClick={deleteItem}>
                            Supprimer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Panneau de droite - Statistiques et Préparation */}
          <div className="space-y-6">
            {/* Statistiques */}
            <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Statistiques
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Fichiers</span>
                  <span className="text-white font-mono">{stats.totalFiles}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Taille totale</span>
                  <span className="text-white font-mono">{stats.totalSize}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Exemples Q/R</span>
                  <span className="text-white font-mono">{stats.examplesCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Dernière préparation</span>
                  <span className="text-white text-sm">
                    {stats.lastPrepared 
                      ? new Date(stats.lastPrepared).toLocaleString()
                      : 'Jamais'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Préparation du Dataset */}
            <Card className="border-slate-800 bg-gradient-to-br from-emerald-900/20 to-slate-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Préparation du Dataset
                </CardTitle>
                <CardDescription>
                  Préparez les données pour l'entraînement Colab
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-300 mb-2">
                    Cette action va :
                  </p>
                  <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                    <li>Valider tous les fichiers JSON d'exemples</li>
                    <li>Convertir au format JSONL pour Colab</li>
                    <li>Générer le dataset final dans data/training/dataset.jsonl</li>
                  </ul>
                </div>

                {isPreparing && (
                  <div className="space-y-2">
                    <Progress value={prepareProgress} className="h-2" />
                    <p className="text-xs text-slate-400 text-center">
                      Préparation en cours... {prepareProgress}%
                    </p>
                  </div>
                )}

                <Button
                  onClick={prepareDataset}
                  disabled={isPreparing || stats.examplesCount === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {isPreparing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Préparation...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Préparer le Dataset
                    </>
                  )}
                </Button>

                {stats.examplesCount === 0 && (
                  <Alert className="border-yellow-500/50 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-400" />
                    <AlertDescription>
                      Aucun exemple trouvé. Ajoutez des paires Q/R dans l'onglet "Collecte Manuelle".
                    </AlertDescription>
                  </Alert>
                )}

                {stats.lastPrepared && (
                  <Alert className="border-emerald-500/50 bg-emerald-500/10">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <AlertDescription>
                      Dataset prêt pour l'entraînement Colab
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Lien vers Colab */}
            <Button
              variant="outline"
              className="w-full border-slate-700 hover:border-emerald-500/50"
              onClick={() => window.location.href = '/training?tab=colab'}
            >
              <Upload className="w-4 h-4 mr-2" />
              Aller à Colab Studio →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}