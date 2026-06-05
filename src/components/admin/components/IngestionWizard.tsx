// src/components/admin/components/IngestionWizard.tsx - VERSION CORRIGÉE
'use client';

import { useState, useRef } from 'react';
import { CloudUpload, Sparkles, BarChart3, Database, Loader2, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAsyncAction } from '@/components/vision/shared/hooks/useAsyncAction';
import type { VisionFileNode } from '@/components/vision/shared/hooks/useFileSystemTree';

type IngestionStep = 'IDLE' | 'UPLOAD' | 'PROCESSING' | 'VECTORIZING' | 'INDEXING' | 'COMPLETE';

interface IngestionWizardProps {
  onComplete: () => void;
  onCancel: () => void;
  targetFolders: VisionFileNode[];
}

export function IngestionWizard({ onComplete, onCancel, targetFolders }: IngestionWizardProps) {
  const [step, setStep] = useState<IngestionStep>('IDLE');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<string>('{}');
  const [description, setDescription] = useState<string>('');
  const [targetFolder, setTargetFolder] = useState<string>('root');
  const [indexingLog, setIndexingLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { execute, isLoading } = useAsyncAction();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStep('UPLOAD');
    }
  };

  const startAIPipeline = async () => {
    if (!uploadedFile) return;
    
    setStep('PROCESSING');
    
    await execute(async () => {
      const formData = new FormData();
      formData.append('image', uploadedFile);
      
      const [metaRes, descRes] = await Promise.all([
        fetch('/api/vision/process', { method: 'POST', body: (() => {
          const fd = new FormData();
          fd.append('image', uploadedFile);
          fd.append('task', 'metadata');
          return fd;
        })() }),
        fetch('/api/vision/process', { method: 'POST', body: (() => {
          const fd = new FormData();
          fd.append('image', uploadedFile);
          fd.append('task', 'description');
          return fd;
        })() })
      ]);
      
      const metaData = await metaRes.json();
      const descData = await descRes.json();
      
      setMetadata(JSON.stringify(metaData.metadata || {}, null, 2));
      setDescription(descData.description || '');
      
      setStep('VECTORIZING');
      
      const featRes = await fetch('/api/vision/process', { method: 'POST', body: (() => {
        const fd = new FormData();
        fd.append('image', uploadedFile);
        fd.append('task', 'features');
        return fd;
      })() });
      
      const featData = await featRes.json();
      
      return { metadata: metaData, description: descData.description, features: featData.features };
    }, {
      successMessage: "✨ Analyse IA complétée",
      errorMessage: "L'analyse IA a échoué"
    });
  };

  const finalizeIngestion = async () => {
    if (!uploadedFile) return;
    
    setStep('INDEXING');
    setIndexingLog([
      "Initialisation de la connexion ChromaDB...",
      "Hachage binaire de l'image...",
      "Injection des métadonnées enrichies..."
    ]);
    
    await execute(async () => {
      const finalMetadata = JSON.parse(metadata);
      const formData = new FormData();
      formData.append('image', uploadedFile);
      formData.append('metadata', JSON.stringify({
        ...finalMetadata,
        description,
        folderId: targetFolder,
        targetPath: targetFolders.find(f => f.id === targetFolder)?.path,
        tags: finalMetadata.tags || []
      }));
      
      const res = await fetch('/api/vision/register', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to index');
      
      setIndexingLog(prev => [
        ...prev,
        "✅ Indexation réussie dans la zone VISION",
        "🚀 Vecteurs propagés vers le moteur de recherche"
      ]);
      
      setStep('COMPLETE');
      
      return { success: true };
    }, {
      successMessage: "✅ Ingestion terminée",
      errorMessage: "L'indexation a échoué"
    });
  };

  const reset = () => {
    // Cleanup preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setUploadedFile(null);
    setPreviewUrl(null);
    setMetadata('{}');
    setDescription('');
    setStep('IDLE');
    onCancel();
  };

  const steps = [
    { label: 'Upload', step: 'UPLOAD' as const, icon: CloudUpload },
    { label: 'IA extraction', step: 'PROCESSING' as const, icon: Sparkles },
    { label: 'Vectorisation', step: 'VECTORIZING' as const, icon: BarChart3 },
    { label: 'Indexation', step: 'INDEXING' as const, icon: Database }
  ];


  if (step === 'COMPLETE') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-10">
        <div className="relative">
          <div className="absolute inset-0 bg-green-500/20 blur-[80px] rounded-full" />
          <div className="relative p-14 bg-green-600/20 rounded-[4rem] border border-green-500/30">
            <CheckCircle2 className="w-32 h-32 text-green-500" />
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-4xl font-black uppercase tracking-tighter">Exploitation Activée</h2>
          <p className="text-gray-400 font-medium max-w-sm mx-auto">
            L'image a été validée, vectorisée et indexée.
          </p>
        </div>
        <div className="flex gap-4">
          <Button onClick={reset} className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl h-14 px-8">
            Nouvelle Ingestion
          </Button>
          <Button onClick={onComplete} className="bg-purple-600 hover:bg-purple-500 rounded-2xl h-14 px-8">
            Terminer
          </Button>
        </div>
      </div>
    );
  }

 // Version alternative plus simple
return (
    <div className="h-full flex flex-col">
      {/* Pipeline steps */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        {steps.map((s, i) => {
          // Déterminer si cette étape est complétée
          const stepOrder = ['IDLE', 'UPLOAD', 'PROCESSING', 'VECTORIZING', 'INDEXING', 'COMPLETE'];
          const currentIndex = stepOrder.indexOf(step);
          const stepIndex = stepOrder.indexOf(s.step);
          const isCompleted = currentIndex > stepIndex;
          const isActive = step === s.step;
          
          return (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full transition-all",
                (isCompleted || isActive) && "bg-purple-600/20 text-purple-400",
                !isCompleted && !isActive && "text-gray-600"
              )}>
                <s.icon className={cn("w-4 h-4", isActive && "animate-pulse")} />
                <span className="text-xs font-black uppercase">{s.label}</span>
              </div>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-white/10" />}
            </div>
          );
        })}
      </div>

      {step === 'IDLE' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-2xl aspect-video bg-black/40 border-2 border-dashed border-white/10 hover:border-purple-500/40 rounded-[3rem] transition-all cursor-pointer flex flex-col items-center justify-center space-y-4 group"
          >
            <div className="p-10 bg-purple-600/10 rounded-full group-hover:scale-110 transition-transform">
              <CloudUpload className="w-16 h-16 text-purple-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-black uppercase tracking-widest text-white">Importer une image</p>
              <p className="text-xs text-gray-500 font-medium mt-1">PNG, JPG, WEBP • Max 10Mo</p>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />
          </div>
        </div>
      )}

      {(step === 'UPLOAD' || step === 'PROCESSING' || step === 'VECTORIZING' || step === 'INDEXING') && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-0">
          {/* Preview */}
          <div className="space-y-6">
            <div className="relative aspect-square bg-black rounded-[2.5rem] overflow-hidden border border-white/10">
              {previewUrl && <img src={previewUrl} className="w-full h-full object-cover" alt="Preview" />}
              <div className="absolute top-4 right-4">
                <Badge className="bg-black/60 backdrop-blur-md text-white font-black text-[9px]">
                  {uploadedFile?.name}
                </Badge>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-3xl p-6 space-y-4 border border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-gray-500">Dossier de destination</span>
              </div>
              <select 
                value={targetFolder}
                onChange={(e) => setTargetFolder(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-xs text-white outline-none focus:border-purple-500/50"
              >
                <option value="root">Racine vision</option>
                {(() => {
                  const flattenFolders = (nodes: VisionFileNode[]): VisionFileNode[] => {
                    let result: VisionFileNode[] = [];
                    nodes.forEach(node => {
                      if (node.type === 'directory') {
                        result.push(node);
                        if (node.children) result = result.concat(flattenFolders(node.children));
                      }
                    });
                    return result;
                  };
                  return flattenFolders(targetFolders).map(n => (
                    <option key={n.id} value={n.id}>{n.path}</option>
                  ));
                })()}
              </select>
            </div>
          </div>

          {/* Metadata & Description */}
          <div className="flex flex-col gap-6 min-h-0">
            <div className="flex-1 flex flex-col bg-black/40 border border-white/5 rounded-[2.5rem] p-8 space-y-4 overflow-hidden">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Métadonnées techniques</h4>
                {step === 'PROCESSING' && <Loader2 className="w-4 h-4 animate-spin text-purple-400 ml-auto" />}
              </div>
              <textarea
                value={metadata}
                onChange={(e) => setMetadata(e.target.value)}
                disabled={step !== 'UPLOAD'}
                className="flex-1 bg-[#0a0a0a]/50 rounded-2xl p-6 font-mono text-xs text-purple-400 outline-none resize-none custom-scrollbar"
              />
            </div>

            <div className="flex-1 flex flex-col bg-black/40 border border-white/5 rounded-[2.5rem] p-8 space-y-4 overflow-hidden">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-purple-400" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Description contextuelle</h4>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={step !== 'UPLOAD'}
                placeholder={step === 'PROCESSING' ? "Génération en cours..." : "Description de l'image..."}
                className="flex-1 bg-[#0a0a0a]/50 rounded-2xl p-6 text-sm text-gray-300 font-medium leading-relaxed outline-none resize-none custom-scrollbar"
              />
            </div>

            {/* Action Buttons */}
            <div className="bg-purple-600/5 border border-purple-500/10 rounded-[2.5rem] p-8">
              {step === 'INDEXING' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-purple-400 animate-pulse" />
                    <span className="text-sm font-black uppercase text-white">Indexation ChromaDB</span>
                  </div>
                  <div className="space-y-2">
                    {indexingLog.map((log, i) => (
                      <div key={i} className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                        <div className="w-1 h-1 bg-purple-500 rounded-full" />
                        <span className="text-[10px] font-medium text-gray-400">{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-white">Pipeline prêt</h3>
                    <p className="text-xs text-gray-500">L'IA va vectoriser et indexer cette image</p>
                  </div>
                  {step === 'UPLOAD' ? (
                    <Button 
                      onClick={startAIPipeline}
                      className="bg-purple-600 hover:bg-purple-500 rounded-2xl h-14 px-10 text-xs font-black uppercase gap-3"
                    >
                      <Sparkles className="w-4 h-4" /> Démarrer l'analyse
                    </Button>
                  ) : (
                    <Button 
                      onClick={finalizeIngestion}
                      disabled={isLoading}
                      className="bg-green-600 hover:bg-green-500 rounded-2xl h-14 px-10 text-xs font-black uppercase gap-3"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                      Finaliser & indexer
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}