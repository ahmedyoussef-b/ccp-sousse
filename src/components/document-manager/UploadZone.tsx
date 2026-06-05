//src/components/document-manager/UploadZone.tsx
'use client';

import { useState, useCallback } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, FolderOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onUpload: (files: File[], targetPath: string) => Promise<void>;
  currentPath: string;
  onPathChange: (path: string) => void;
  availablePaths: Array<{ label: string; value: string }>;
}

interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  targetPath?: string;
}

/**
 * UploadZone Elite 32 - Gestion intelligente de l'assignation documentaire
 */
export function UploadZone({ onUpload, currentPath, onPathChange, availablePaths }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [, setIsUploading] = useState(false);

  const processFiles = useCallback(async (files: FileList) => {
    if (!currentPath) {
      // ✅ CORRECTION : Feedback plus smooth au lieu d'alert bloquant
      const errorElement = document.createElement('div');
      errorElement.className = 'fixed top-4 right-4 px-6 py-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm font-bold animate-in fade-in slide-in-from-top-4';
      errorElement.textContent = '⚠️ Veuillez d\'abord sélectionner un dossier de destination';
      document.body.appendChild(errorElement);
      setTimeout(() => errorElement.remove(), 4000);
      return;
    }

    const newUploads: UploadItem[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      size: file.size,
      status: 'pending',
      targetPath: currentPath
    }));
    
    setUploads(prev => [...newUploads, ...prev]);
    setIsUploading(true);
    
    for (const upload of newUploads) {
      setUploads(prev => prev.map(u => 
        u.id === upload.id ? { ...u, status: 'uploading' } : u
      ));
      
      const file = Array.from(files).find(f => f.name === upload.name);
      if (!file) continue;
      
      try {
        await onUpload([file], currentPath);
        setUploads(prev => prev.map(u => 
          u.id === upload.id ? { ...u, status: 'success' } : u
        ));
      } catch (error) {
        setUploads(prev => prev.map(u => 
          u.id === upload.id ? { ...u, status: 'error', error: String(error) } : u
        ));
      }
    }
    
    setTimeout(() => {
      setUploads(prev => prev.filter(u => u.status !== 'success'));
      setIsUploading(false);
    }, 5000);
  }, [onUpload, currentPath]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
  }, [processFiles]);


  return (
    <div className="p-6 space-y-6 bg-black/10">
      {/* Sélecteur de destination industrielle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Destination du chargement</label>
          {currentPath && (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-green-500/10 border border-green-500/30 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[9px] font-bold text-green-400 tracking-tight truncate max-w-xs">{currentPath.split('/').pop()}</span>
            </div>
          )}
        </div>
        <div className="relative group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600/20 rounded-lg group-focus-within:bg-blue-600 transition-colors">
            <FolderOpen className="w-4 h-4 text-blue-400 group-focus-within:text-white" />
          </div>
          <select
            value={currentPath}
            onChange={(e) => onPathChange(e.target.value)}
            className={cn(
              "w-full pl-12 pr-4 py-3 bg-[#2f2f2f] rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-2 transition-all cursor-pointer appearance-none",
              currentPath ? "border border-green-500/30 focus:ring-green-500/20" : "border border-white/5 focus:ring-blue-500/20"
            )}
          >
            <option value="" disabled>Choisir un dossier cible...</option>
            {availablePaths.map(path => (
              <option key={path.value} value={path.value}>
                {path.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Zone de drop réactive */}
      <div
        className={cn(
          "border-2 border-dashed rounded-3xl p-10 text-center transition-all duration-500",
          !currentPath ? "opacity-40 grayscale cursor-not-allowed border-white/5" : (
            isDragging 
              ? "border-blue-500 bg-blue-500/10 shadow-2xl shadow-blue-500/10 scale-[1.01]" 
              : "border-white/10 bg-white/5 hover:border-white/20"
          )
        )}
        onDragOver={(e) => { e.preventDefault(); if(currentPath) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-blue-400" />
        </div>
        <h4 className="text-sm font-black uppercase text-white tracking-widest mb-1">Dépôt de documents</h4>
        <p className="text-xs text-gray-500 mb-6">PDF, MD, JSON, JPG • Taille Max 200MB</p>
        
        <label className={cn("inline-block", !currentPath && "pointer-events-none")}>
          <input
            type="file"
            multiple
            disabled={!currentPath}
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.docx,.txt,.md,.json,.jpg,.png"
          />
          <span className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer transition-all font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20">
            Parcourir les fichiers
          </span>
        </label>
      </div>
      
      {/* Liste de suivi des uploads */}
      {uploads.length > 0 && (
        <div className="space-y-3 animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-2 ml-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Opérations en cours</span>
          </div>
          {uploads.map(upload => (
            <div key={upload.id} className="flex items-center justify-between p-4 bg-[#2f2f2f] border border-white/5 rounded-2xl shadow-lg">
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-2 bg-white/5 rounded-lg shrink-0">
                  <FileText className="w-4 h-4 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate uppercase tracking-tight">{upload.name}</p>
                  <p className="text-[9px] font-black text-gray-500 uppercase">Vers : {upload.targetPath?.split(/[\\/]/).pop()}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                {upload.status === 'uploading' && (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                )}
                {upload.status === 'success' && (
                  <div className="p-1.5 bg-green-500/20 rounded-full">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  </div>
                )}
                {upload.status === 'error' && (
                  // ✅ Correction: Utilisation d'un wrapper avec title
                  <div className="relative group" title={upload.error}>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  </div>
                )}
                <button
                  onClick={() => setUploads(prev => prev.filter(u => u.id !== upload.id))}
                  className="p-1 hover:bg-white/10 rounded-lg text-gray-600 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}