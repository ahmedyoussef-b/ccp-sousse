/**
 * @fileOverview DocumentManager - Orchestrateur central de la gestion documentaire.
 * Version 3.1 - Architecture par zones + Validation des chunks avant indexation
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FileTree } from './FileTree';
import { UploadZone } from './UploadZone';
import { SyncStatus, type SyncEvent } from './SyncStatus';
import { Database, Search, RefreshCw, FolderPlus, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ValidationProgress } from '@/components/admin/ValidationProgress';
import { Button } from '../ui/button';
import { IngestionProgress, FileNode } from '@/lib/document-manager/types';



// Configuration
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff'
];

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

// Mapping des types de documents
const inferDocumentType = (fileName: string, filePath: string): string => {
  const lowerName = fileName.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  
  if (lowerName.includes('procedure') || lowerPath.includes('procedure')) return 'procedure';
  if (lowerName.includes('alarme') || lowerPath.includes('alarme')) return 'alarme_hmi';
  if (lowerName.includes('schema') || lowerPath.includes('synoptique')) return 'synoptique';
  if (lowerName.includes('maintenance') || lowerPath.includes('maintenance')) return 'maintenance';
  if (lowerName.includes('formation') || lowerPath.includes('formation')) return 'rh';
  if (lowerName.includes('composant') || lowerPath.includes('composant')) return 'composant';
  return 'document_brut';
};

interface DocumentManagerProps {
  onUploadComplete?: () => void;
  externalActiveJobs?: IngestionProgress[];
}

export const DocumentManager = ({ onUploadComplete, externalActiveJobs }: DocumentManagerProps = {}) => {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(384);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [activeIngestions, setActiveIngestions] = useState<IngestionProgress[]>([]);
  
  // 🔥 État pour la validation en cours
  const [validatingFile, setValidatingFile] = useState<{
    name: string;
    progress: number;
    currentScore: number;
    isValid: boolean;
    warnings: string[];
    validationId?: string;
  } | null>(null);
  
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const validationEventSourceRef = useRef<EventSource | null>(null);

  // === 0. PERSISTENCE LARGEUR ===
  useEffect(() => {
    const savedWidth = localStorage.getItem('document-sidebar-width');
    if (savedWidth) {
      const parsed = parseInt(savedWidth, 10);
      if (!isNaN(parsed) && parsed >= 250 && parsed <= 600) {
        setSidebarWidth(parsed);
      }
    }
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    localStorage.setItem('document-sidebar-width', sidebarWidth.toString());
  }, [sidebarWidth]);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      if (newWidth >= 250 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // === 1. CHARGEMENT ARBORESCENCE ===
  const loadTree = useCallback(async (forced = false) => {
    if (!forced) setLoading(true);
    try {
      const url = forced ? '/api/documents/tree?refresh=true' : '/api/documents/tree';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load tree');
      const data = await response.json();
      setTree(data.tree || []);
    } catch (error) {
      console.error('[UI][DOCS] Error loading tree:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger l'arborescence des documents.",
      });
    } finally {
      if (!forced) setLoading(false);
    }
  }, [toast]);

  // === 2. DÉTECTION DE LA ZONE ===
  const detectZoneFromPath = (path: string): string => {
    const parts = path.split('/');
    if (parts.length === 0) return 'SHARED';
    const firstSegment = parts[0];
    const knownZones = [
      'A0_DIVERS', 'B0_AUXILIAIRES', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE',
      'TG1', 'TG2', 'RH', 'MAINTENANCE', 'SHARED'
    ];
    if (knownZones.includes(firstSegment)) return firstSegment;
    return 'SHARED';
  };

  // === 3. VALIDATION DES FICHIERS ===
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { valid: false, error: `Type non supporté: ${file.type || 'inconnu'}` };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` };
    }
    return { valid: true };
  };

  // 🔥 Configuration SSE pour la validation

  // === 4. UPLOAD + PIPELINE COMPLET (avec validation réelle) ===
  const handleFileUpload = async (files: File[], targetPath: string) => {
    // Nettoyer le chemin
    let cleanPath = targetPath;
    cleanPath = cleanPath.replace(/^[A-Z]:\\/i, '');
    cleanPath = cleanPath.replace(/\\/g, '/');
    const docRoot = 'centrale_documents';
    const rootIndex = cleanPath.indexOf(docRoot);
    if (rootIndex !== -1) {
      cleanPath = cleanPath.substring(rootIndex + docRoot.length);
    }
    cleanPath = cleanPath.replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    cleanPath = cleanPath.replace(/(\.\.[\/\\])+/g, '');
    
    const zone = detectZoneFromPath(cleanPath);
    
    for (const file of files) {
      // Validation basique
      const validation = validateFile(file);
      if (!validation.valid) {
        toast({
          variant: "destructive",
          title: "❌ Fichier rejeté",
          description: `${file.name}: ${validation.error}`,
        });
        continue;
      }

      // 🔥 Phase 1 : Validation sémantique (appel API réelle)
      toast({
        title: "🔍 Validation sémantique",
        description: `${file.name} - Analyse de la qualité...`,
      });
      
      // Créer un FormData pour l'upload temporaire pour validation
      const validateFormData = new FormData();
      validateFormData.append('file', file);
      validateFormData.append('zone', zone);
      
      try {
        // Appel à l'API de validation
        const validateResponse = await fetch('/api/documents/validate-upload', {
          method: 'POST',
          body: validateFormData
        });
        
        if (!validateResponse.ok) {
          const error = await validateResponse.json();
          throw new Error(error.error || 'Échec de la validation');
        }
        
        const validateResult = await validateResponse.json();
        
        if (!validateResult.success) {
          toast({
            variant: "destructive",
            title: "❌ Validation échouée",
            description: `${file.name}: ${validateResult.error || 'Qualité insuffisante'}`,
          });
          continue;
        }
        
        // Afficher le rapport de validation
        if (validateResult.validation) {
          const avgScore = (validateResult.validation.averageScore * 100).toFixed(0);
          if (validateResult.validation.validChunks === validateResult.validation.totalChunks) {
            toast({
              title: "✅ Validation réussie",
              description: `${file.name} - ${validateResult.validation.validChunks}/${validateResult.validation.totalChunks} chunks valides (${avgScore}%)`,
            });
          } else {
            toast({
              title: "⚠️ Validation partielle",
              description: `${file.name} - ${validateResult.validation.validChunks}/${validateResult.validation.totalChunks} chunks valides (${avgScore}%)`,
              duration: 8000,
            });
          }
        }
        
      } catch (error: any) {
        console.error('[VALIDATION] Error:', error);
        toast({
          variant: "destructive",
          title: "❌ Erreur validation",
          description: `${file.name}: ${error.message}`,
        });
        continue;
      }
      
      // Phase 2 : Upload réel
      const documentType = inferDocumentType(file.name, cleanPath);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', cleanPath);
      formData.append('zone', zone);
      formData.append('type', documentType);
      
      try {
        const uploadResponse = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error || 'Échec du transfert');
        }
        
        toast({
          title: "📄 Document transféré",
          description: `${file.name} - Indexation vectorielle démarrée (zone ${zone})`,
        });

        setExpandedNodes(prev => {
          const next = new Set(prev);
          next.add(zone);
          if (cleanPath) next.add(cleanPath);
          return next;
        });

        loadTree(true);
        onUploadComplete?.();

      } catch (error: any) {
        console.error('[UPLOAD] Error:', error);
        toast({
          variant: "destructive",
          title: "❌ Erreur",
          description: `${file.name}: ${error.message}`,
        });
      }
    }
  };
  
  // === 5. FIND NODE BY PATH ===
  const findNodeByPath = useCallback((nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // === 6. RENOMMAGE ===
  const handleRename = async (path: string, newName: string) => {
    try {
      // ✅ MISE À JOUR OPTIMISTE - Mettre à jour le tree immédiatement
      setTree(prev => {
        const updateTreeOptimistic = (nodes: FileNode[]): FileNode[] => {
          return nodes.map(n => {
            if (n.path === path) {
              return { ...n, name: newName };
            }
            if (n.children) {
              return { ...n, children: updateTreeOptimistic(n.children) };
            }
            return n;
          });
        };
        return updateTreeOptimistic(prev);
      });
      
      // Ensuite appel API (async)
      const response = await fetch('/api/documents/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, newName })
      });
      if (!response.ok) throw new Error('Rename failed');
      
      toast({ 
        title: "✏️ Élément renommé", 
        description: `Nouveau nom: ${newName}` 
      });
      
      // Reload pour valider
      loadTree(true);
      
    } catch (error: any) {
      // Reload en cas d'erreur pour restaurer
      await loadTree(true);
      toast({ 
        variant: "destructive", 
        title: "❌ Erreur Renommage", 
        description: error.message 
      });
    }
  };

  // === 7. SUPPRESSION ===
  const handleDelete = async (node: FileNode) => {
    try {
      const documentId = node.path
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase()
        .replace(/_+/g, '_');
      
      // ✅ MISE À JOUR OPTIMISTE - Supprimer du tree immédiatement
      setTree(prev => {
        const updateTreeOptimistic = (nodes: FileNode[]): FileNode[] => {
          return nodes.reduce<FileNode[]>((acc, n) => {
            if (n.path === node.path) {
              // Sauter ce nœud (suppression)
              return acc;
            }
            if (n.children) {
              return [...acc, { ...n, children: updateTreeOptimistic(n.children) }];
            }
            return [...acc, n];
          }, []);
        };
        return updateTreeOptimistic(prev);
      });
      if (selectedNode?.path === node.path) {
        setSelectedNode(null);
        setSelectedPath(undefined);
      }
      
      // Ensuite appel API (async)
      const response = await fetch('/api/documents/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: documentId,
          filePath: node.path,
          zone: node.zone
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Échec suppression');
      }
      
      toast({
        title: "🗑️ Document supprimé",
        description: `${node.name} a été purgé.`,
      });
      
      // Reload complet pour s'assurer de la cohérence
      await loadTree(true);
      
    } catch (error: any) {
      console.error('[DELETE] Error:', error);
      // Reload en cas d'erreur pour restaurer l'état correct
      await loadTree(true);
      toast({
        variant: "destructive",
        title: "❌ Erreur de suppression",
        description: error.message,
      });
    }
  };

  // === 8. EXPANSION / SÉLECTION ===
  const handleToggleExpand = (path: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectNode = (node: FileNode) => {
    setSelectedPath(node.path);
    setSelectedNode(node);
  };

  // === 9. CRÉATION DOSSIER ===
  const handleCreateFolder = async (parentPath: string, name: string) => {
    try {
      // ✅ MISE À JOUR OPTIMISTE - Créer le nœud dans l'UI immédiatement
      const newFolderNode: FileNode = {
        id: `${parentPath}/${name}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
        name,
        path: `${parentPath}/${name}`,
        type: 'directory',
        children: [],
        badge: 0
      };
      
      setTree(prev => {
        const updateTreeOptimistic = (nodes: FileNode[]): FileNode[] => {
          return nodes.map(n => {
            if (n.path === parentPath && n.type === 'directory') {
              return {
                ...n,
                children: [...(n.children || []), newFolderNode]
              };
            }
            if (n.children) {
              return { ...n, children: updateTreeOptimistic(n.children) };
            }
            return n;
          });
        };
        return updateTreeOptimistic(prev);
      });
      setExpandedNodes(prev => new Set(prev).add(parentPath));
      
      // Ensuite appel API (async)
      const response = await fetch('/api/documents/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPath, name })
      });
      if (!response.ok) throw new Error('Échec création dossier');
      
      toast({
        title: "📁 Dossier créé",
        description: `${name} ajouté avec succès.`,
      });
      
      // Reload pour valider
      await loadTree(true);
      
    } catch (error: any) {
      // Reload en cas d'erreur pour restaurer
      await loadTree(true);
      toast({
        variant: "destructive",
        title: "❌ Erreur création",
        description: error.message,
      });
    }
  };

  // @ts-nocheck
// === 10. SETUP SSE MONITORING (MOVED TO PARENT) ===
  useEffect(() => {
    if (externalActiveJobs) {
      setActiveIngestions(externalActiveJobs);
      
      // Mettre à jour les syncEvents si nécessaire (optionnel car AdminPage gère déjà les toasts)
      if (externalActiveJobs.length > 0) {
        const lastJob = externalActiveJobs[externalActiveJobs.length - 1];
        const newEvent: SyncEvent = {
          type: lastJob.status === 'processing' ? 'sync-start' : (lastJob.status === 'completed' ? 'sync-complete' : 'sync-error'),
          stage: lastJob.step.toUpperCase(),
          path: lastJob.jobId,
          timestamp: Date.now(),
          success: lastJob.status === 'completed',
          error: lastJob.error,
          message: lastJob.status === 'completed' ? 'Traitement vectoriel réussi' : undefined
        };
        setSyncEvents(prev => [newEvent, ...prev].slice(0, 50));
      }
    }
  }, [externalActiveJobs]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (validationEventSourceRef.current) {
        validationEventSourceRef.current.close();
      }
    };
  }, [toast, loadTree]);

  // === 11. CHARGEMENT INITIAL ===
  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // === 12. FILTRAGE PAR RECHERCHE ===
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    
    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.reduce<FileNode[]>((acc, node) => {
        const matches = node.name.toLowerCase().includes(searchQuery.toLowerCase());
        const filteredChildren = node.children ? filterNodes(node.children) : [];
        
        if (matches || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children
          });
        }
        return acc;
      }, []);
    };
    
    return filterNodes(tree);
  }, [tree, searchQuery]);

  // === 13. CHEMINS DISPONIBLES ===
  const availablePaths = useMemo(() => {
    const paths: Array<{ label: string; value: string }> = [];
    const extractPaths = (nodes: FileNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'directory') {
          let label = node.name;
          if (node.name.includes('_')) label = node.name.replace(/_/g, ' ');
          paths.push({ label, value: node.path });
          if (node.children) extractPaths(node.children);
        }
      });
    };
    extractPaths(tree);
    return paths.sort((a, b) => a.label.localeCompare(b.label));
  }, [tree]);

  const currentUploadPath = selectedNode?.type === 'directory' 
    ? selectedNode.path 
    : (selectedNode?.path ? selectedNode.path.split(/[\\/]/).slice(0, -1).join('/') : '');

  return (
    <div 
      ref={containerRef}
      className="flex flex-col lg:flex-row h-[calc(100vh-12rem)] bg-[#171717] rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl"
    >
      {/* PANEL GAUCHE - ARBORESCENCE */}
      <div 
        className="border-r border-white/5 bg-black/20 flex flex-col min-h-0 relative group transition-[width] duration-75 ease-out"
        style={{ width: sidebarWidth >= 256 ? `${sidebarWidth}px` : undefined }}
      >
        <div className="p-6 border-b border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600/20 rounded-2xl">
                <Database className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white leading-none mb-1">Zones</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Documents & Vecteurs</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                onClick={() => loadTree(true)}
                title="Rafraîchir l'arborescence"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <Input 
              placeholder="Chercher dans l'arborescence..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/40 border-white/5 rounded-xl pl-9 text-xs h-9 focus-visible:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-600 gap-4">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500/50" />
              <p className="text-[10px] font-black uppercase tracking-widest">Synchronisation...</p>
            </div>
          ) : (
            <FileTree
              nodes={filteredTree}
              expandedNodes={expandedNodes}
              selectedPath={selectedPath}
              onToggleExpand={handleToggleExpand}
              onSelect={handleSelectNode}
              onDelete={handleDelete}
              onRename={handleRename}
              onCreateFolder={handleCreateFolder}
            />
          )}
        </div>

        {/* HANDLE DE REDIMENSIONNEMENT */}
        <div
          onMouseDown={startResizing}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-20 transition-all duration-200",
            isResizing ? "bg-blue-500 opacity-100" : "bg-transparent group-hover:bg-blue-500/30 opacity-0 group-hover:opacity-100"
          )}
        />
      </div>
      
      {/* PANEL DROIT - UPLOAD & STATUT */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
          <div className="max-w-4xl mx-auto space-y-8 pb-10">
            {/* Header avec statut connexion SSE */}
            <div className="p-6 border-b border-white/5 bg-black/10 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-purple-600/20 rounded-xl">
                  <FolderPlus className="w-4 h-4 text-purple-400" />
                </div>
                <h3 className="text-xs font-black uppercase text-white tracking-[0.2em]">Approvisionnement Documentaire</h3>
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2",
                "bg-green-500/10 text-green-500"
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full", "bg-green-500")} />
                {'Monitoring actif'}
              </div>
            </div>

            {/* 🔥 AFFICHAGE DE LA VALIDATION EN COURS */}
            {validatingFile && (
              <div className="px-6">
                <ValidationProgress
                  fileName={validatingFile.name}
                  progress={validatingFile.progress}
                  currentScore={validatingFile.currentScore}
                  isValid={validatingFile.isValid}
                  warnings={validatingFile.warnings}
                  onComplete={() => setValidatingFile(null)}
                />
              </div>
            )}

            {/* Zone d'upload */}
            <UploadZone 
              onUpload={handleFileUpload}
              currentPath={currentUploadPath}
              onPathChange={(path) => {
                const node = findNodeByPath(tree, path);
                if (node) setSelectedNode(node);
              }}
              availablePaths={availablePaths}
            />

            {/* Suivi des ingestions actives */}
            {activeIngestions.length > 0 && (
              <div className="px-6">
                <div className="bg-yellow-600/5 border border-yellow-500/20 rounded-2xl p-4">
                  <h4 className="text-[10px] font-black text-yellow-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Indexation en cours
                  </h4>
                  <div className="space-y-3">
                    {activeIngestions.filter(j => j.status !== 'completed').map(job => (
                      <div key={job.jobId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-300 font-mono">{job.fileName}</span>
                          <span className="text-gray-500 capitalize">{job.step}</span>
                        </div>
                        <Progress value={job.progress} className="h-1 bg-yellow-600/20" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Informations du document/dossier sélectionné */}
            <div className="px-6">
              <Card className="bg-[#2f2f2f] border-white/5 text-white rounded-3xl shadow-2xl">
                <CardContent className="p-8 text-center">
                  {!selectedNode ? (
                    <div className="space-y-4">
                      <div className="w-16 h-16 bg-blue-600/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <Database className="w-8 h-8 text-blue-500 opacity-40" />
                      </div>
                      <p className="text-sm font-black text-blue-400 uppercase tracking-[0.2em] mb-2">Sélection requise</p>
                      <p className="text-xs text-gray-500 font-medium max-w-sm mx-auto leading-relaxed">
                        Sélectionnez une zone ou un dossier dans l&apos;arborescence pour y déposer des documents.
                      </p>
                      <div className="flex items-center justify-center gap-2 text-[10px] text-gray-600">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Formats supportés: PDF, TXT, MD, JSON, JPEG, PNG</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-4 mb-6">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Type</p>
                          <p className="text-xs font-bold text-white uppercase">{selectedNode.type}</p>
                        </div>
                        {selectedNode.type === 'file' && selectedNode.size && (
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Taille</p>
                            <p className="text-xs font-bold text-white">{(selectedNode.size / 1024).toFixed(1)} KB</p>
                          </div>
                        )}
                        {selectedNode.type === 'file' && (
                          <div className="p-4 bg-green-600/10 rounded-2xl border border-green-500/20">
                            <p className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-1">Statut</p>
                            <p className="text-xs font-bold text-green-400">Vectorisé</p>
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-black text-white uppercase tracking-tight">{selectedNode.name}</p>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                        Chemin : {selectedNode.path}
                      </p>
                      {selectedNode.modifiedAt && (
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                          Dernière modification : {new Date(selectedNode.modifiedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        
        <SyncStatus events={syncEvents} isConnected={true} />
      </div>
    </div>
  );
};

export default DocumentManager;