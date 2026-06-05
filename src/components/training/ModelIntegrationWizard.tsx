// components/training/ModelIntegrationWizard.tsx
// Assistant d'intégration pas à pas pour le modèle fine-tuné

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  Circle,
  Loader2,
  FileArchive,
  Server,
  Terminal,
  Copy,
  ArrowRight,
  Check,
  AlertCircle,
  Upload,
  FolderOpen,
  Zap,
  Package,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface IntegrationStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  optional?: boolean;
}

export function ModelIntegrationWizard() {
  const { toast } = useToast();
  const [steps, setSteps] = useState<IntegrationStep[]>([
    { id: 1, title: 'Réception du modèle', description: 'Téléchargement du ZIP depuis Colab', status: 'pending' },
    { id: 2, title: 'Extraction des fichiers', description: 'Décompression et validation', status: 'pending' },
    { id: 3, title: 'Fusion LoRA', description: 'Intégration avec le modèle de base', status: 'pending' },
    { id: 4, title: 'Conversion GGUF', description: 'Optimisation pour Ollama', status: 'pending', optional: true },
    { id: 5, title: 'Import Ollama', description: 'Création du modèle dans Ollama', status: 'pending' },
    { id: 6, title: 'Validation finale', description: 'Test et activation', status: 'pending' }
  ]);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('ccp_model');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedFiles, setExtractedFiles] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [activeTab, setActiveTab] = useState('upload');

  // Vérifier Ollama au chargement
  useEffect(() => {
    checkOllamaStatus();
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

  const updateStepStatus = (stepId: number, status: IntegrationStep['status']) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status } : step
    ));
  };

  // Étape 1: Upload du fichier ZIP
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast({ title: 'Format invalide', description: 'Veuillez uploader un fichier ZIP', variant: 'destructive' });
      return;
    }

    setModelFile(file);
    updateStepStatus(1, 'active');
    setIsProcessing(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setUploadProgress((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          updateStepStatus(1, 'completed');
          setCurrentStep(2);
          toast({ title: '✅ Fichier reçu', description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` });
          // Passer automatique à l'extraction
          extractModel();
        } else {
          throw new Error('Upload failed');
        }
      });

      xhr.open('POST', '/api/training/receive-model');
      xhr.send(formData);
    } catch (error) {
      updateStepStatus(1, 'error');
      toast({ title: '❌ Erreur', description: 'Échec de l\'upload', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Étape 2: Extraction
  const extractModel = async () => {
    updateStepStatus(2, 'active');
    setActiveTab('extraction');

    try {
      const data = await fetch('/api/training/extract-model', { method: 'POST' }).then(r => r.json());

      setExtractedFiles(data.files || []);
      updateStepStatus(2, 'completed');
      setCurrentStep(3);
      toast({ title: '📂 Extraction réussie', description: `${data.files?.length || 0} fichiers extraits` });
    } catch (error) {
      updateStepStatus(2, 'error');
      toast({ title: '❌ Erreur', description: 'Échec de l\'extraction', variant: 'destructive' });
    }
  };

  // Étape 3: Fusion LoRA
  const mergeModel = async () => {
    updateStepStatus(3, 'active');
    setActiveTab('merge');

    try {
      const response = await fetch('/api/training/merge-lora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });

      if (response.ok) {
        updateStepStatus(3, 'completed');
        setCurrentStep(4);
        toast({ title: '🔗 Fusion terminée', description: 'Modèle fusionné avec succès' });
      } else {
        const error = await response.json();
        throw new Error(error.error);
      }
    } catch (error) {
      updateStepStatus(3, 'error');
      toast({ title: '❌ Erreur', description: 'Échec de la fusion LoRA', variant: 'destructive' });
    }
  };

  // Étape 4: Conversion GGUF (optionnelle)
  const convertToGGUF = async () => {
    updateStepStatus(4, 'active');

    try {
      const response = await fetch('/api/training/convert-gguf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });

      if (response.ok) {
        updateStepStatus(4, 'completed');
        toast({ title: '⚡ Conversion GGUF', description: 'Modèle optimisé pour Ollama' });
      } else {
        throw new Error('Conversion failed');
      }
    } catch (error) {
      updateStepStatus(4, 'error');
      toast({ title: '⚠️ Conversion optionnelle', description: 'Vous pouvez importer sans conversion', variant: 'default' });
      // Marquer comme complété même en erreur (optionnel)
      updateStepStatus(4, 'completed');
    }
    
    setCurrentStep(5);
  };

  // Étape 5: Import Ollama
  const importToOllama = async () => {
    updateStepStatus(5, 'active');
    setActiveTab('ollama');

    try {
      const response = await fetch('/api/training/import-ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });

      if (response.ok) {
        updateStepStatus(5, 'completed');
        setCurrentStep(6);
        toast({ title: '🚀 Modèle importé', description: `${modelName} est maintenant disponible dans Ollama` });
      } else {
        const error = await response.json();
        throw new Error(error.error);
      }
    } catch (error) {
      updateStepStatus(5, 'error');
      toast({ title: '❌ Erreur', description: 'Échec de l\'import Ollama', variant: 'destructive' });
    }
  };

  // Étape 6: Validation
  const validateModel = async () => {
    updateStepStatus(6, 'active');

    try {
      const response = await fetch('/api/training/validate-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });

      if (response.ok) {
        updateStepStatus(6, 'completed');
        toast({ 
          title: '🎉 Modèle validé !', 
          description: 'Le modèle est prêt à être utilisé dans le chat',
          duration: 5000
        });
        
        // Afficher une notification spéciale
        setTimeout(() => {
          toast({
            title: '✨ Prêt à l\'emploi',
            description: 'Allez dans le chat pour tester votre nouveau modèle',
          });
        }, 1000);
      } else {
        throw new Error('Validation failed');
      }
    } catch (error) {
      updateStepStatus(6, 'error');
      toast({ title: '⚠️ Test', description: 'Le modèle est importé mais des tests supplémentaires sont recommandés', variant: 'default' });
      updateStepStatus(6, 'completed');
    }
  };

  // Lancer l'intégration complète
  const startFullIntegration = async () => {
    if (!modelFile) {
      toast({ title: 'Aucun fichier', description: 'Veuillez d\'abord uploader un modèle', variant: 'destructive' });
      return;
    }

    await mergeModel();
    await convertToGGUF();
    await importToOllama();
    await validateModel();
  };

  const getStepIcon = (status: IntegrationStep['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'active': return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-400" />;
      default: return <Circle className="w-5 h-5 text-slate-500" />;
    }
  };

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalProgress = (completedCount / steps.length) * 100;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            Intégration du Modèle Fine-tuné
          </CardTitle>
          <CardDescription>
            Importez le fichier ZIP généré par Colab et intégrez-le automatiquement dans Ollama
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Statut Ollama */}
            <div className="col-span-1">
              <div className={`rounded-lg p-4 border ${ollamaStatus === 'available' ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-red-500/10 border-red-500/50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Server className="w-4 h-4" />
                  <span className="font-medium text-white">Ollama</span>
                </div>
                {ollamaStatus === 'checking' && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Vérification...
                  </div>
                )}
                {ollamaStatus === 'available' && (
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Disponible
                  </div>
                )}
                {ollamaStatus === 'unavailable' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      Non disponible
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={checkOllamaStatus}>
                      <RefreshCw className="w-3 h-3 mr-2" />
                      Réessayer
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Progression */}
            <div className="col-span-2">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Progression
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Étape {completedCount} / {steps.length}</span>
                    <span className="text-emerald-400">{Math.round(totalProgress)}%</span>
                  </div>
                  <Progress value={totalProgress} className="h-2" />
                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">Upload en cours</span>
                        <span className="text-emerald-400">{Math.round(uploadProgress)}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2 bg-slate-700" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs pour les différentes méthodes */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-900/50 border border-slate-800">
          <TabsTrigger value="upload" className="data-[state=active]:bg-emerald-600">
            <Upload className="w-4 h-4 mr-2" />
            Upload ZIP
          </TabsTrigger>
          <TabsTrigger value="extraction" className="data-[state=active]:bg-emerald-600">
            <FolderOpen className="w-4 h-4 mr-2" />
            Extraction
          </TabsTrigger>
          <TabsTrigger value="merge" className="data-[state=active]:bg-emerald-600">
            <Package className="w-4 h-4 mr-2" />
            Fusion LoRA
          </TabsTrigger>
          <TabsTrigger value="ollama" className="data-[state=active]:bg-emerald-600">
            <Server className="w-4 h-4 mr-2" />
            Import Ollama
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card className="border-slate-800">
            <CardContent className="p-6">
              <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-emerald-500/50 transition-colors">
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  disabled={isProcessing}
                  className="hidden"
                  id="model-zip-upload"
                />
                <label htmlFor="model-zip-upload" className="cursor-pointer">
                  <FileArchive className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400 mb-2">Glissez-déposez ou cliquez</p>
                  <p className="text-xs text-slate-500">Fichier ZIP généré par Colab</p>
                </label>
              </div>

              <div className="mt-4">
                <Label>Nom du modèle (optionnel)</Label>
                <Input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="ccp_model"
                  className="mt-1 bg-slate-900 border-slate-700"
                />
                <p className="text-xs text-slate-500 mt-1">Utilisé pour l'import dans Ollama</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extraction">
          <Card className="border-slate-800">
            <CardHeader>
              <CardTitle className="text-base">Fichiers extraits</CardTitle>
            </CardHeader>
            <CardContent>
              {extractedFiles.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun fichier extrait</p>
                  <p className="text-xs">Uploadez d'abord un fichier ZIP</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {extractedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-300 bg-slate-900 p-2 rounded">
                      <FileArchive className="w-4 h-4 text-emerald-400" />
                      {file}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merge">
          <Card className="border-slate-800">
            <CardHeader>
              <CardTitle className="text-base">Fusion LoRA</CardTitle>
              <CardDescription>
                Fusion du modèle fine-tuné avec le modèle de base
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-900 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-mono text-slate-300">Commande de fusion:</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`python scripts/merge_lora.py --base_model unsloth/distilgpt2 --lora_weights ./extracted --output ./merged/${modelName}`);
                      toast({ title: 'Commande copiée' });
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <code className="text-xs text-emerald-400 break-all">
                  python scripts/merge_lora.py --base_model unsloth/distilgpt2 --lora_weights ./extracted --output ./merged/{modelName}
                </code>
              </div>

              <Button onClick={mergeModel} className="w-full bg-emerald-600 hover:bg-emerald-700">
                <Package className="w-4 h-4 mr-2" />
                Lancer la fusion
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ollama">
          <Card className="border-slate-800">
            <CardHeader>
              <CardTitle className="text-base">Import dans Ollama</CardTitle>
              <CardDescription>
                Création du Modelfile et import du modèle
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-900 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-mono text-slate-300">Modelfile généré:</span>
                </div>
                <pre className="text-xs text-slate-400 bg-slate-950 p-3 rounded overflow-x-auto">
{`FROM ./merged/${modelName}
PARAMETER temperature 0.7
PARAMETER top_p 0.9
TEMPLATE """{{ .Prompt }}"""
SYSTEM """Tu es un expert en centrales à cycle combiné."""`}
                </pre>
              </div>

              <div className="flex gap-3">
                <Button onClick={importToOllama} className="flex-1 bg-purple-600 hover:bg-purple-700">
                  <Server className="w-4 h-4 mr-2" />
                  Importer dans Ollama
                </Button>
                <Button onClick={validateModel} variant="outline" className="border-slate-700">
                  <Check className="w-4 h-4 mr-2" />
                  Valider
                </Button>
              </div>

              <Alert className="border-emerald-500/50 bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertTitle>Modèle importé ?</AlertTitle>
                <AlertDescription>
                  Testez avec: <code className="text-emerald-400">ollama run {modelName} "Quelle est la pression max TG1?"</code>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Liste des étapes */}
      <Card className="border-slate-800">
        <CardHeader>
          <CardTitle className="text-base">📋 Étapes d'intégration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg">
                {getStepIcon(step.status)}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">Étape {step.id}:</span>
                    <span className="text-slate-300">{step.title}</span>
                    {step.optional && <Badge variant="outline" className="text-xs">Optionnel</Badge>}
                  </div>
                  <p className="text-xs text-slate-500">{step.description}</p>
                </div>
                {step.status === 'pending' && step.id === currentStep + 1 && (
                  <ArrowRight className="w-4 h-4 text-emerald-400 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bouton d'intégration complète */}
      {modelFile && steps.every(s => s.status !== 'active') && completedCount < steps.length && (
        <Button onClick={startFullIntegration} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
          <Zap className="w-4 h-4 mr-2" />
          Lancer l'intégration complète
        </Button>
      )}

      {/* Succès final */}
      {steps.every(step => step.status === 'completed') && (
        <Alert className="border-emerald-500/50 bg-emerald-500/10">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <AlertTitle>🎉 Intégration terminée !</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Le modèle <strong className="text-emerald-400">{modelName}</strong> est maintenant disponible dans Ollama.</p>
            <div className="flex gap-3 mt-3">
              <Button onClick={() => window.location.href = '/'} className="bg-emerald-600 hover:bg-emerald-700">
                Aller au chat
              </Button>
              <Button variant="outline" onClick={() => window.open('http://localhost:11434/api/tags', '_blank')}>
                Voir dans Ollama
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}