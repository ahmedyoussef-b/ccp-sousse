// app/admin/reindex/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2,
  FileText,
  ArrowLeft,
  Upload,
  RefreshCw,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface StepResult {
  step: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  data?: any;
  duration?: number;
}

interface InvertedIndexStatus {
  exists: boolean;
  totalFiles?: number;
  totalTerms?: number;
  lastUpdated?: string;
  stats?: {
    uniqueTerms: number;
    avgOccurrencesPerTerm: number;
    mostFrequentTerms: Array<{ term: string; count: number }>;
  };
}

export default function ReindexPage() {
  const [zone, setZone] = useState('SHARED');
  const [isRunning, setIsRunning] = useState(false);
  const [uploadedFilePath, setUploadedFilePath] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('socle support turbine');
  const [testQuery, setTestQuery] = useState('decrit SOCLE ET SUPPORTS TURBINE');
  const [reindexResult, setReindexResult] = useState<any>(null);
  const [lastAnswer, setLastAnswer] = useState<string>('');
  
  // État pour l'index inversé
  const [invertedIndexStatus, setInvertedIndexStatus] = useState<InvertedIndexStatus>({ exists: false });
  const [isGeneratingIndex, setIsGeneratingIndex] = useState(false);
  const [indexGenerationProgress, setIndexGenerationProgress] = useState<string>('');
  
  const [steps, setSteps] = useState<StepResult[]>([
    { step: '1. Upload du fichier', status: 'pending', message: 'En attente...' },
    { step: '2. Indexation forcée dans ChromaDB', status: 'pending', message: 'En attente...' },
    { step: '3. Génération index inversé', status: 'pending', message: 'En attente...' },
    { step: '4. Vérification dans ChromaDB', status: 'pending', message: 'En attente...' },
    { step: '5. Test de la requête IA', status: 'pending', message: 'En attente...' }
  ]);

  // Charger le statut de l'index inversé au montage
  useEffect(() => {
    checkInvertedIndexStatus();
  }, []);

  // Vérifier le statut de l'index inversé
  const checkInvertedIndexStatus = async () => {
    try {
      const response = await fetch('/api/admin/generate-inverted-index');
      const data = await response.json();
      if (data.success) {
        setInvertedIndexStatus(data.stats);
      }
    } catch (error) {
      console.error('[INVERTED-INDEX] Erreur vérification:', error);
    }
  };

  // Générer ou régénérer l'index inversé complet
  const generateInvertedIndex = async () => {
    setIsGeneratingIndex(true);
    setIndexGenerationProgress('Scan des documents en cours...');
    
    try {
      const response = await fetch('/api/admin/generate-inverted-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rebuild_all' })
      });
      
      const data = await response.json();
      if (data.success) {
        setIndexGenerationProgress(`✅ Index généré: ${data.totalFiles} fichiers, ${data.totalTerms} termes uniques (${data.duration}ms)`);
        await checkInvertedIndexStatus();
        setTimeout(() => setIndexGenerationProgress(''), 5000);
      } else {
        setIndexGenerationProgress(`❌ Erreur: ${data.error}`);
      }
    } catch (error: any) {
      setIndexGenerationProgress(`❌ Erreur: ${error.message}`);
    } finally {
      setTimeout(() => setIsGeneratingIndex(false), 2000);
    }
  };

  // Générer l'index inversé pour un document spécifique
  const indexDocumentInInvertedIndex = async (filePath: string, fileName: string, content: string, zone: string) => {
    try {
      const response = await fetch('/api/admin/generate-inverted-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'index_document',
          filePath,
          fileName,
          content,
          zone
        })
      });
      
      const data = await response.json();
      if (data.success) {
        console.log(`[INVERTED-INDEX] Document indexé: ${fileName}`);
        return true;
      } else {
        console.error(`[INVERTED-INDEX] Erreur indexation:`, data.error);
        return false;
      }
    } catch (error) {
      console.error(`[INVERTED-INDEX] Erreur:`, error);
      return false;
    }
  };

  const updateStep = (index: number, status: StepResult['status'], message: string, data?: any, duration?: number) => {
    setSteps(prev => prev.map((s, i) => 
      i === index ? { ...s, status, message, data, duration } : s
    ));
  };

  const executeStep = async (index: number, action: () => Promise<any>): Promise<any> => {
    updateStep(index, 'running', 'En cours...');
    const startTime = Date.now();
    try {
      const result = await action();
      const duration = Date.now() - startTime;
      updateStep(index, 'success', 'Terminé avec succès', result, duration);
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      updateStep(index, 'error', `Erreur: ${error.message}`, null, duration);
      throw error;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Lire le contenu immédiatement pour l'index inversé
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setFileContent(content);
        console.log(`[REINDEX] Contenu fichier chargé: ${content.length} caractères`);
      };
      reader.onerror = (error) => {
        console.error('[REINDEX] Erreur lecture fichier:', error);
        setFileContent('');
      };
      reader.readAsText(file, 'utf-8');
    } else {
      setSelectedFile(null);
      setFileContent('');
    }
  };

  // Upload du fichier
  const uploadFile = async () => {
    if (!selectedFile) {
      throw new Error('Aucun fichier sélectionné');
    }
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('zone', zone);
    formData.append('type', 'document_brut');
    
    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Échec upload');
    }
    
    const data = await response.json();
    
    // 🔥 CORRECTION: Vérifier où se trouve le chemin du fichier dans la réponse
    let filePath = data.path || data.filePath || data.file?.path;
    
    if (!filePath) {
      console.error('[REINDEX] Réponse upload complète:', data);
      throw new Error('Le chemin du fichier n\'a pas été retourné par l\'API');
    }
    
    setUploadedFilePath(filePath);
    console.log(`[REINDEX] Fichier uploadé avec succès: ${filePath}`);
    
    // Retourner les informations nécessaires pour l'étape suivante
    return { 
      filePath: filePath, 
      fileName: selectedFile.name,
      content: fileContent
    };
  };

  // Indexation forcée via API dédiée
  const forceReindex = async () => {
    // 🔥 CORRECTION: Vérifier que uploadedFilePath est défini
    if (!uploadedFilePath) {
      throw new Error('Aucun fichier uploadé. Vérifiez que l\'étape 1 est terminée avec succès.');
    }
    
    console.log(`[REINDEX] Indexation forcée du fichier: ${uploadedFilePath}`);
    
    const response = await fetch('/api/admin/reindex-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        filePath: uploadedFilePath, 
        zone: zone 
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Échec réindexation');
    }
    
    const data = await response.json();
    setReindexResult(data);
    return data;
  };

  // Vérification ChromaDB
  const checkChromaDB = async () => {
    const response = await fetch('/api/documents/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query: searchQuery, 
        zone, 
        nResults: 10 
      })
    });
    
    if (!response.ok) {
      throw new Error('Échec recherche');
    }
    
    return await response.json();
  };

  // Test requête IA
  const testIA = async () => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt: testQuery,
        zone: 'SHARED',
        _useRouter: true
      })
    });
    
    if (!response.ok) {
      throw new Error('Échec requête');
    }
    
    const data = await response.json();
    setLastAnswer(data.answer);
    return data;
  };

  const runReindex = async () => {
    if (!selectedFile) {
      alert('Veuillez sélectionner un fichier');
      return;
    }
    
    // Vérifier que le contenu du fichier est chargé
    if (!fileContent) {
      console.warn('[REINDEX] Contenu fichier non chargé, tentative de rechargement...');
      const reader = new FileReader();
      const content = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
        reader.readAsText(selectedFile, 'utf-8');
      });
      setFileContent(content);
      if (!content) {
        alert('Impossible de lire le contenu du fichier');
        return;
      }
    }
    
    setIsRunning(true);
    setLastAnswer('');
    let uploadResult: { filePath: string; fileName: string; content: string } | null = null;

    try {
      // Étape 1: Upload
      uploadResult = await executeStep(0, async () => await uploadFile());

      // Étape 2: Indexation forcée dans ChromaDB
      await executeStep(1, async () => await forceReindex());

      // Étape 3: Génération index inversé
      await executeStep(2, async () => {
        const contentToIndex = fileContent || uploadResult?.content;
        
        if (!contentToIndex || contentToIndex.trim().length === 0) {
          throw new Error('Contenu du fichier non disponible pour l\'index inversé. Vérifiez que le fichier est un fichier texte lisible.');
        }
        
        const success = await indexDocumentInInvertedIndex(
          uploadResult!.filePath,
          uploadResult!.fileName,
          contentToIndex,
          zone
        );
        
        if (!success) {
          throw new Error('Échec de l\'indexation dans l\'index inversé');
        }
        
        await checkInvertedIndexStatus();
        return { message: 'Index inversé mis à jour', success: true };
      });

      // Étape 4: Vérification ChromaDB
      await executeStep(3, async () => await checkChromaDB());

      // Étape 5: Test IA
      await executeStep(4, async () => await testIA());

    } catch (error: any) {
      console.error('Erreur:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Re-vérifier ChromaDB sans réindexer
  const verifyOnly = async () => {
    setIsRunning(true);
    setLastAnswer('');
    try {
      await executeStep(3, async () => await checkChromaDB());
      await executeStep(4, async () => await testIA());
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: StepResult['status']) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running': return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default: return <div className="w-5 h-5 rounded-full border-2 border-gray-500" />;
    }
  };

  const getStatusBadge = (status: StepResult['status']) => {
    switch (status) {
      case 'success': return <Badge className="bg-green-600">Succès</Badge>;
      case 'error': return <Badge variant="destructive">Erreur</Badge>;
      case 'running': return <Badge className="bg-blue-600">En cours</Badge>;
      default: return <Badge variant="outline">En attente</Badge>;
    }
  };

  const progress = (steps.filter(s => s.status === 'success').length / steps.length) * 100;

  return (
    <div className="min-h-screen bg-[#171717] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="icon" asChild className="bg-white/5 border-white/10">
            <Link href="/admin">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase">Réindexation forcée</h1>
            <p className="text-sm text-gray-400">Upload, indexation ChromaDB, index inversé et test d&apos;un fichier</p>
          </div>
        </div>

        {/* Carte de statut de l'index inversé */}
        <Card className="bg-gradient-to-r from-purple-900/20 to-purple-800/10 border-purple-500/30 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-600/20 rounded-lg">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Index inversé</h3>
                  <p className="text-xs text-gray-400">
                    {invertedIndexStatus.exists 
                      ? `✅ Actif - ${invertedIndexStatus.totalFiles || 0} fichiers, ${invertedIndexStatus.totalTerms || 0} termes uniques`
                      : '⚠️ Non généré - Cliquez sur "Générer" pour activer la recherche lexicale'}
                  </p>
                  {invertedIndexStatus.lastUpdated && (
                    <p className="text-xs text-gray-500 mt-1">
                      Dernière mise à jour: {new Date(invertedIndexStatus.lastUpdated).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <Button
                onClick={generateInvertedIndex}
                disabled={isGeneratingIndex || isRunning}
                size="sm"
                variant="outline"
                className="border-purple-500 text-purple-400 hover:bg-purple-600/20"
              >
                {isGeneratingIndex ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {isGeneratingIndex ? 'Génération...' : (invertedIndexStatus.exists ? 'Régénérer' : 'Générer')}
              </Button>
            </div>
            {indexGenerationProgress && (
              <div className="mt-3 text-xs text-purple-300 bg-purple-600/10 rounded-lg p-2">
                {indexGenerationProgress}
              </div>
            )}
            {invertedIndexStatus.stats && invertedIndexStatus.stats.mostFrequentTerms.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                <span className="text-xs text-gray-500 mr-2">Top termes:</span>
                {invertedIndexStatus.stats.mostFrequentTerms.slice(0, 8).map((term, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs bg-purple-600/10 border-purple-500/30">
                    {term.term} ({term.count})
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#2f2f2f] border-white/10 mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Fichier à indexer (.txt, .pdf, .md)</label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".txt,.pdf,.md"
                  onChange={handleFileSelect}
                  disabled={isRunning}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm file:mr-2 file:py-1 file:px-3 file:rounded-md file:bg-blue-600 file:text-white file:border-0"
                />
              </div>
              {selectedFile && (
                <p className="text-xs text-green-400 mt-1">
                  ✅ Fichier sélectionné: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
              {fileContent && (
                <p className="text-xs text-blue-400 mt-1">
                  📄 Contenu chargé: {fileContent.length} caractères
                </p>
              )}
            </div>
            
            <div>
              <label className="text-sm text-gray-400 block mb-1">Zone ChromaDB</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm"
                disabled={isRunning}
              >
                <option value="SHARED">SHARED</option>
                <option value="RH">RH</option>
                <option value="TG1">TG1</option>
                <option value="TG2">TG2</option>
              </select>
              <p className="text-xs text-yellow-500 mt-1">
                ⚠️ Important: La requête IA utilisera la zone SHARED automatiquement
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-1">Requête de vérification ChromaDB</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm"
                disabled={isRunning}
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-1">Requête IA à tester</label>
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm"
                disabled={isRunning}
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={runReindex}
                disabled={isRunning || !selectedFile}
                className="flex-1 bg-blue-600 hover:bg-blue-500"
              >
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                {isRunning ? 'Exécution...' : 'Uploader et réindexer'}
              </Button>
              
              <Button
                onClick={verifyOnly}
                disabled={isRunning}
                variant="outline"
                className="flex-1 bg-white/5 border-white/10 hover:bg-white/10"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Vérifier uniquement
              </Button>
            </div>

            {uploadedFilePath && reindexResult && (
              <div className="bg-green-600/10 border border-green-500/30 rounded-lg p-3">
                <p className="text-xs text-green-400 font-mono">
                  ✅ Dernière indexation ChromaDB: {reindexResult.chunksCount} chunks
                </p>
                <p className="text-xs text-gray-500 mt-1 break-all">
                  📁 {uploadedFilePath.split('/').pop()}
                </p>
              </div>
            )}

            {lastAnswer && (
              <div className="bg-blue-600/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-xs text-blue-400 font-medium mb-1">💬 Réponse de l&apos;IA:</p>
                <p className="text-sm text-gray-300">{lastAnswer}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {uploadedFilePath && !reindexResult && (
          <Card className="bg-blue-600/10 border-blue-500/30 mb-6">
            <CardContent className="p-3">
              <p className="text-xs text-blue-400 font-mono break-all">
                📁 Fichier uploadé: {uploadedFilePath.split('/').pop()}
              </p>
              <p className="text-xs text-yellow-500 mt-1">
                ⏳ En attente d&apos;indexation. Cliquez sur "Uploader et réindexer" pour continuer.
              </p>
            </CardContent>
          </Card>
        )}

        {isRunning && (
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span>Progression</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2 bg-white/10" />
          </div>
        )}

        <div className="space-y-4">
          {steps.map((step, idx) => (
            <Card key={idx} className={cn(
              "bg-[#2f2f2f] border transition-all",
              step.status === 'running' ? "border-blue-500/50 shadow-lg shadow-blue-500/10" : "border-white/10"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(step.status)}
                    <span className="font-medium">{step.step}</span>
                    {getStatusBadge(step.status)}
                  </div>
                  {step.duration && <span className="text-xs text-gray-500">{step.duration}ms</span>}
                </div>
                <p className="text-sm text-gray-400 ml-8">{step.message}</p>
                
                {step.data && (
                  <div className="mt-3 ml-8 bg-black/30 rounded-lg p-3 overflow-auto max-h-64">
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                      {typeof step.data === 'string' ? step.data : JSON.stringify(step.data, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {steps.every(s => s.status === 'success') && (
          <Card className="mt-6 bg-green-600/10 border-green-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
                <div>
                  <p className="font-bold text-green-500">✅ Cycle complet terminé avec succès !</p>
                  <p className="text-sm text-gray-400">Le fichier est uploadé, indexé dans ChromaDB, ajouté à l&apos;index inversé et testé.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {steps.some(s => s.status === 'error') && !isRunning && (
          <Card className="mt-6 bg-red-600/10 border-red-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <XCircle className="w-6 h-6 text-red-500" />
                <div>
                  <p className="font-bold text-red-500">❌ Une erreur est survenue</p>
                  <p className="text-sm text-gray-400">Vérifiez les détails dans l&apos;étape concernée.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}