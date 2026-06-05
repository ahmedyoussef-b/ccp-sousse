// components/training/OllamaModelManager.tsx
// Version simplifiée - Uniquement import et gestion des modèles

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Server,
  Download,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Trash2,
  HardDrive,
  FolderOpen,
  Upload
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OllamaModel {
  name: string;
  size: string;
  modified: string;
  isActive: boolean;
}

interface ImportStatus {
  isImporting: boolean;
  progress: number;
  message: string;
  logs: string[];
}

export function OllamaModelManager() {
  const { toast } = useToast();
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    isImporting: false,
    progress: 0,
    message: '',
    logs: []
  });
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');

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
    setIsLoading(true);
    try {
      const response = await fetch('/api/ollama/models');
      if (response.ok) {
        const data = await response.json();
        
        const configRes = await fetch('/api/config/active-model');
        let activeModel = '';
        if (configRes.ok) {
          const configData = await configRes.json();
          activeModel = configData.model;
        }
        
        setModels((data.models || []).map((m: any) => ({
          ...m,
          isActive: m.name === activeModel
        })));
      }
    } catch (error) {
      console.error('Error loading models:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const importModel = async () => {
    setImportStatus({
      isImporting: true,
      progress: 0,
      message: 'Recherche du dernier fichier ZIP...',
      logs: []
    });

    try {
      const progressInterval = setInterval(() => {
        setImportStatus(prev => ({
          ...prev,
          progress: Math.min(prev.progress + 10, 90)
        }));
      }, 1000);

      const response = await fetch('/api/ollama/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      clearInterval(progressInterval);

      if (response.ok) {
        const data = await response.json();
        setImportStatus({
          isImporting: false,
          progress: 100,
          message: '✅ Import terminé avec succès',
          logs: data.logs || ['Modèle importé avec succès']
        });
        
        toast({
          title: '✅ Modèle importé',
          description: `Modèle "${data.modelName}" disponible dans Ollama`,
        });
        
        loadModels();
      } else {
        const error = await response.json();
        setImportStatus({
          isImporting: false,
          progress: 0,
          message: `❌ Erreur: ${error.error}`,
          logs: error.logs || [error.error]
        });
        toast({
          title: '❌ Import échoué',
          description: error.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      setImportStatus({
        isImporting: false,
        progress: 0,
        message: '❌ Erreur réseau',
        logs: ['Impossible de contacter le serveur']
      });
      toast({
        title: '❌ Erreur',
        description: 'Impossible de contacter le serveur',
        variant: 'destructive',
      });
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
          duration: 8000,
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
        setModels(prev => prev.map(m => ({
          ...m,
          isActive: m.name === modelName
        })));
        
        toast({
          title: '✅ Modèle activé',
          description: `${modelName} est maintenant le modèle par défaut. Redémarrez l'application.`,
        });
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

  return (
    <div className="space-y-6">
      {/* Statut Ollama */}
      <Card className="border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="w-4 h-4 text-emerald-400" />
              Connexion Ollama
            </CardTitle>
            <Badge 
              variant={ollamaStatus === 'available' ? 'default' : 'destructive'}
              className={ollamaStatus === 'available' ? 'bg-emerald-600' : ''}
            >
              {ollamaStatus === 'available' ? '🟢 Connecté' : '🔴 Non connecté'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {ollamaStatus === 'unavailable' && (
            <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Ollama n'est pas en cours d'exécution. Démarrez-le avec <code className="bg-red-950 px-2 py-1 rounded">ollama serve</code>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Section Import */}
      <Card className="border-slate-800 bg-gradient-to-br from-emerald-900/20 to-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="w-4 h-4 text-emerald-400" />
            Importer un modèle
          </CardTitle>
          <CardDescription>
            Importez le dernier fichier ZIP depuis Colab
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {importStatus.isImporting ? (
            <div className="space-y-3">
              <Progress value={importStatus.progress} className="h-2" />
              <p className="text-sm text-slate-400">{importStatus.message}</p>
              <div className="bg-slate-900 rounded-lg p-3 max-h-32 overflow-y-auto">
                {importStatus.logs.map((log, i) => (
                  <p key={i} className="text-xs font-mono text-slate-400">{log}</p>
                ))}
              </div>
            </div>
          ) : (
            <Button 
              onClick={importModel}
              disabled={ollamaStatus !== 'available'}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Importer le dernier modèle
            </Button>
          )}
          
          {importStatus.message && !importStatus.isImporting && importStatus.progress === 100 && (
            <Alert className="border-emerald-500/50 bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <AlertDescription>{importStatus.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Section Modèles installés */}
      <Card className="border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              Modèles installés
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={loadModels} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <CardDescription>
            Gérez vos modèles fine-tunés
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun modèle installé</p>
              <p className="text-sm">Cliquez sur "Importer le dernier modèle" ci-dessus</p>
            </div>
          ) : (
            <div className="space-y-3">
              {models.map((model) => (
                <div key={model.name} className="bg-slate-900 rounded-lg p-4 border border-slate-800">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                          <span className="text-slate-500 text-xs">Taille</span>
                          <p className="text-slate-300 text-sm">{model.size}</p>
                        </div>
                        <div>
                          <span className="text-slate-500 text-xs">Modifié</span>
                          <p className="text-slate-300 text-sm">{model.modified}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testModel(model.name)}
                        className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                        title="Tester le modèle"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveModel(model.name)}
                        disabled={model.isActive}
                        className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                        title="Définir comme actif"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteModel(model.name)}
                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
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

      {/* Informations */}
      <Alert className="border-blue-500/50 bg-blue-500/10">
        <FolderOpen className="h-4 w-4 text-blue-400" />
        <AlertTitle>Emplacement des fichiers</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <p>• Déposez vos fichiers ZIP dans: <code className="bg-blue-950 px-2 py-0.5 rounded">data/models/uploads/</code></p>
          <p>• Les modèles importés sont stockés dans: <code className="bg-blue-950 px-2 py-0.5 rounded">~/.ollama/models/</code></p>
          <p>• Après avoir activé un modèle, redémarrez l'application pour l'utiliser dans le chat</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}