// components/training/OllamaCommandsPanel.tsx
// Panneau des commandes Ollama pour l'étape 5

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Terminal,
  Copy,
  CheckCircle2,
  Loader2,
  Server,
  Download,
  Play,
  List,
  Trash2,
  RefreshCw,
  AlertCircle,
  HardDrive,
  Package
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ModelInfo {
  name: string;
  size: string;
  modified: string;
  isActive: boolean;
}

export function OllamaCommandsPanel() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('import');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [, setSelectedModel] = useState<string>('');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  
  // État pour l'import
  const [zipPath, setZipPath] = useState('');
  const [modelName, setModelName] = useState('');

  useEffect(() => {
    checkOllamaStatus();
    loadModels();
  }, []);

  const checkOllamaStatus = async () => {
    try {
      const response = await fetch('/api/ollama/status');
      if (response.ok) {
        setOllamaStatus('available');
      } else {
        setOllamaStatus('unavailable');
      }
    } catch {
      setOllamaStatus('unavailable');
    }
  };

  const loadModels = async () => {
    setIsLoadingModels(true);
    try {
      const response = await fetch('/api/ollama/models');
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
      }
    } catch (error) {
      console.error('Error loading models:', error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const copyToClipboard = (text: string, description: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Commande copiée',
      description: description,
    });
  };

  const executeImport = async () => {
    if (!zipPath && !modelName) {
      toast({
        title: 'Paramètres requis',
        description: 'Spécifiez un chemin ZIP ou un nom de modèle',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportLog([]);

    // Progression initiale
    setImportProgress(10);
    setImportLog(['🚀 Initialisation de l\'import...']);

    try {
      const response = await fetch('/api/ollama/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipPath, modelName: modelName || undefined })
      });

      setImportProgress(95);
      setImportLog(prev => [...prev, '📥 Réception des données...']);

      if (response.ok) {
        const data = await response.json();
        setImportLog(data.logs || ['Import terminé avec succès']);
        toast({
          title: '✅ Import réussi',
          description: `Modèle ${data.modelName || modelName} importé avec succès`,
        });
        loadModels();
      } else {
        const error = await response.json();
        setImportLog([`❌ Erreur: ${error.error}`]);
        toast({
          title: '❌ Import échoué',
          description: error.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      setImportLog(prev => [...prev, `❌ Erreur réseau: ${error}`]);
      toast({
        title: '❌ Erreur',
        description: 'Impossible de contacter le serveur',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      setTimeout(() => setImportProgress(0), 2000);
    }
  };

  const testModel = async (modelName: string) => {
    toast({
      title: '🧪 Test du modèle',
      description: `Test de ${modelName} en cours...`,
    });
    
    try {
      const response = await fetch('/api/ollama/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({
          title: '✅ Test réussi',
          description: `Réponse: ${data.response.substring(0, 100)}...`,
          duration: 5000,
        });
      } else {
        throw new Error('Test failed');
      }
    } catch (error) {
      toast({
        title: '❌ Test échoué',
        description: 'Le modèle ne répond pas correctement',
        variant: 'destructive',
      });
    }
  };

  const setActiveModel = async (modelName: string) => {
    try {
      const response = await fetch('/api/config/active-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });
      
      if (response.ok) {
        setSelectedModel(modelName);
        toast({
          title: '✅ Modèle activé',
          description: `${modelName} est maintenant le modèle par défaut`,
        });
        loadModels();
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error) {
      toast({
        title: '❌ Erreur',
        description: 'Impossible de changer le modèle actif',
        variant: 'destructive',
      });
    }
  };

  const deleteModel = async (modelName: string) => {
    if (confirm(`Supprimer définitivement ${modelName} ?`)) {
      try {
        const response = await fetch(`/api/ollama/models/${modelName}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          toast({ title: '✅ Modèle supprimé', description: `${modelName} a été retiré` });
          loadModels();
        }
      } catch (error) {
        toast({
          title: '❌ Erreur',
          description: 'Impossible de supprimer le modèle',
          variant: 'destructive',
        });
      }
    }
  };

  const commands = [
    {
      name: 'Import automatique',
      description: 'Importe le dernier fichier ZIP trouvé',
      command: 'npm run ollama:import',
      icon: <Download className="w-4 h-4" />,
    },
    {
      name: 'Import avec paramètres',
      description: 'Importe un ZIP spécifique avec un nom personnalisé',
      command: 'npm run ollama:import -- --zip "C:\\path\\model.zip" --name "mon_modele"',
      icon: <Package className="w-4 h-4" />,
    },
    {
      name: 'Surveillance continue',
      description: 'Surveille le dossier uploads et importe automatiquement',
      command: 'npm run ollama:watch',
      icon: <RefreshCw className="w-4 h-4" />,
    },
    {
      name: 'Lister les modèles',
      description: 'Affiche tous les modèles installés dans Ollama',
      command: 'npm run ollama:list',
      icon: <List className="w-4 h-4" />,
    },
    {
      name: 'Tester un modèle',
      description: 'Teste un modèle avec des questions prédéfinies',
      command: 'npm run ollama:test -- ccp_model',
      icon: <Play className="w-4 h-4" />,
    },
    {
      name: 'Changer modèle actif',
      description: 'Définit le modèle par défaut de l\'application',
      command: 'npm run ollama:set -- ccp_model',
      icon: <Server className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Statut Ollama */}
      <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-emerald-400" />
              Interface de commandes Ollama
            </CardTitle>
            <Badge 
              variant={ollamaStatus === 'available' ? 'default' : 'destructive'}
              className={ollamaStatus === 'available' ? 'bg-emerald-600' : ''}
            >
              {ollamaStatus === 'available' ? '🟢 Connecté' : '🔴 Non connecté'}
            </Badge>
          </div>
          <CardDescription>
            Exécutez des commandes pour importer, gérer et tester vos modèles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ollamaStatus === 'unavailable' && (
            <Alert className="mb-4 border-red-500/50 bg-red-500/10">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <AlertTitle>Ollama non disponible</AlertTitle>
              <AlertDescription>
                Ollama n'est pas en cours d'exécution. Démarrez-le avec <code className="bg-red-950 px-2 py-1 rounded">ollama serve</code>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-900/50 border border-slate-800">
          <TabsTrigger value="import" className="data-[state=active]:bg-emerald-600">
            <Download className="w-4 h-4 mr-2" />
            Import
          </TabsTrigger>
          <TabsTrigger value="commands" className="data-[state=active]:bg-emerald-600">
            <Terminal className="w-4 h-4 mr-2" />
            Commandes
          </TabsTrigger>
          <TabsTrigger value="models" className="data-[state=active]:bg-emerald-600">
            <List className="w-4 h-4 mr-2" />
            Modèles
          </TabsTrigger>
        </TabsList>

        {/* Onglet Import */}
        <TabsContent value="import">
          <Card className="border-slate-800">
            <CardHeader>
              <CardTitle className="text-base">Import d'un modèle</CardTitle>
              <CardDescription>
                Importez un fichier ZIP depuis Colab vers Ollama
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 block mb-1">Chemin du fichier ZIP (optionnel)</label>
                <input
                  type="text"
                  value={zipPath}
                  onChange={(e) => setZipPath(e.target.value)}
                  placeholder="C:\chemin\vers\modele.zip"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-xs text-slate-500 mt-1">Laissez vide pour utiliser le dernier ZIP trouvé</p>
              </div>
              
              <div>
                <label className="text-sm text-slate-400 block mb-1">Nom du modèle (optionnel)</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="ccp_model"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-xs text-slate-500 mt-1">Nom personnalisé pour le modèle dans Ollama</p>
              </div>

              {isImporting && (
                <div className="space-y-2">
                  <Progress value={importProgress} className="h-2" />
                  <p className="text-xs text-slate-400 text-center">Import en cours... {importProgress}%</p>
                  <div className="bg-slate-900 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {importLog.map((log, i) => (
                      <p key={i} className="text-xs font-mono text-slate-300">{log}</p>
                    ))}
                  </div>
                </div>
              )}

              <Button 
                onClick={executeImport} 
                disabled={isImporting}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Importer le modèle
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Commandes */}
        <TabsContent value="commands">
          <Card className="border-slate-800">
            <CardHeader>
              <CardTitle className="text-base">Commandes disponibles</CardTitle>
              <CardDescription>
                Copiez et exécutez ces commandes dans votre terminal
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {commands.map((cmd, idx) => (
                  <div key={idx} className="bg-slate-900 rounded-lg p-4 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {cmd.icon}
                        <h3 className="font-medium text-white">{cmd.name}</h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(cmd.command, cmd.name)}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Copier
                      </Button>
                    </div>
                    <p className="text-sm text-slate-400 mb-2">{cmd.description}</p>
                    <code className="text-xs text-emerald-400 bg-slate-950 p-2 rounded block overflow-x-auto">
                      {cmd.command}
                    </code>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Modèles */}
        <TabsContent value="models">
          <Card className="border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Modèles installés</CardTitle>
                <Button variant="outline" size="sm" onClick={loadModels} className="border-slate-700">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Rafraîchir
                </Button>
              </div>
              <CardDescription>
                Gérez les modèles disponibles dans Ollama
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingModels ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              ) : models.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucun modèle installé</p>
                  <p className="text-sm">Utilisez l'onglet "Import" pour ajouter un modèle</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {models.map((model) => (
                    <div key={model.name} className="bg-slate-900 rounded-lg p-4 border border-slate-800">
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Server className="w-4 h-4 text-emerald-400" />
                            <span className="font-mono text-white">{model.name}</span>
                            {model.isActive && (
                              <Badge className="bg-emerald-600 text-xs">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Actif
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-slate-500">Taille</span>
                              <p className="text-white">{model.size}</p>
                            </div>
                            <div>
                              <span className="text-slate-500">Modifié</span>
                              <p className="text-white">{model.modified}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => testModel(model.name)}
                            className="text-blue-400 hover:text-blue-300"
                            title="Tester le modèle"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveModel(model.name)}
                            className="text-emerald-400 hover:text-emerald-300"
                            title="Définir comme actif"
                            disabled={model.isActive}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteModel(model.name)}
                            className="text-red-400 hover:text-red-300"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Documentation rapide */}
      <Alert className="border-blue-500/50 bg-blue-500/10">
        <Terminal className="h-4 w-4 text-blue-400" />
        <AlertTitle>Documentation rapide</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <p>• Les modèles importés sont stockés dans: <code className="bg-blue-950 px-2 py-0.5 rounded">~/.ollama/models/</code></p>
          <p>• Pour changer le modèle actif dans l'application, utilisez la commande <code className="bg-blue-950 px-2 py-0.5 rounded">npm run ollama:set -- mon_modele</code></p>
          <p>• La surveillance continue importe automatiquement tout nouveau fichier ZIP dans <code className="bg-blue-950 px-2 py-0.5 rounded">data/models/uploads/</code></p>
        </AlertDescription>
      </Alert>
    </div>
  );
}