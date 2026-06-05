// src/components/admin/MetadataIntegrator.tsx - VERSION AVEC PRÉPARATIONS
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Box, Sparkles, FolderSearch, X, Settings, Layers, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { VisionContainer } from '@/components/vision/shared/components/VisionContainer';
import { VisionSidebar } from '@/components/vision/shared/components/VisionSidebar';
import { useFileSystemTree } from '@/components/vision/shared/hooks/useFileSystemTree';
import type { VisionFileNode } from '@/components/vision/shared/types/type';
import { IngestionWizard } from './components/IngestionWizard';
import { MetadataViewer } from './components/MetadataViewer';
import { AssemblyWizard } from './components/AssemblyWizard';
import { PreparationPanel } from './components/PreparationPanel';
import { useAsyncAction } from '../vision/shared/hooks/useAsyncAction';

export function MetadataIntegrator() {
  const { tree, loading, expandedNodes, loadTree, toggleNode } = useFileSystemTree();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [showIngestion, setShowIngestion] = useState(false);
  const [showAssembly, setShowAssembly] = useState(false);
  const [activeTab, setActiveTab] = useState<'metadata' | 'preparation'>('metadata');
  const [isEditing, setIsEditing] = useState(false);
  const { execute, isLoading: isActionLoading } = useAsyncAction();
  const { toast } = useToast();
  // Debounce ref for selection to avoid rapid re-renders when navigating tree
  const selectionDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (selectionDebounceRef.current) {
        clearTimeout(selectionDebounceRef.current);
      }
    };
  }, []);

  // Find the selected node in the current tree
  const selectedNode = useMemo(() => {
    if (!selectedPath) return null;
    
    const findNode = (nodes: VisionFileNode[]): VisionFileNode | null => {
      for (const node of nodes) {
        if (node.path === selectedPath) return node;
        
        // Search in images
        const img = node.images?.find(i => i.id === selectedPath);
        if (img) {
          return {
            id: img.id,
            name: img.filename,
            path: img.id,
            type: 'file',
            parentId: node.id,
            imageType: img.imageType,
            hasPreparations: img.hasPreparations
          } as VisionFileNode;
        }

        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    return findNode(tree);
  }, [tree, selectedPath]);


  const handleSelectNode = (node: VisionFileNode) => {
    // Reset panels immediately
    setShowIngestion(false);
    setShowAssembly(false);
    setActiveTab('metadata');

    // Debounce selection to avoid rapid re-renders when navigating
    if (selectionDebounceRef.current) {
      clearTimeout(selectionDebounceRef.current);
    }
    selectionDebounceRef.current = window.setTimeout(() => {
      setSelectedPath(node.path);
      selectionDebounceRef.current = null;
    }, 200);
  };

  const handleRefresh = () => {
    loadTree();
    toast({ title: "🔄 Synchronisation", description: "Arborescence mise à jour" });
  };

  const handleStartIngestion = () => {
    setSelectedPath(null);
    setShowIngestion(true);
    setShowAssembly(false);
  };

  const handleStartAssembly = () => {
    setSelectedPath(null);
    setShowAssembly(true);
    setShowIngestion(false);
  };

  const handlePreparationComplete = () => {
    toast({ title: "✅ Préparation terminée", description: "L'image a été préparée avec succès" });
    loadTree(); // Recharger pour mettre à jour les statuts
  };

  const handleDeleteNode = async (node: VisionFileNode) => {
    const isFile = node.type === 'file';
    const confirmMsg = isFile 
      ? `Supprimer l'image "${node.name}" ?`
      : `Supprimer le dossier "${node.name}" et tout son contenu ?`;
    
    if (!window.confirm(confirmMsg)) return;

    await execute(async () => {
      const endpoint = isFile ? `/api/vision/images/${node.id}` : `/api/vision/fs-tree?path=${encodeURIComponent(node.path)}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) throw new Error("Échec de la suppression");
      
      if (selectedPath === node.path) setSelectedPath(null);
      await loadTree();
    }, {
      successMessage: "Suppression réussie",
      errorMessage: "Erreur lors de la suppression"
    });
  };

  const handleRenameNode = async (path: string, newName: string) => {
    await execute(async () => {
      const res = await fetch('/api/vision/fs-tree', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, newName })
      });
      if (!res.ok) throw new Error("Échec du renommage");
      await loadTree();
    }, {
      successMessage: "Renommé avec succès",
      errorMessage: "Erreur lors du renommage"
    });
  };

  const handleCreateFolder = async (parentPath: string, name: string) => {
    await execute(async () => {
      const res = await fetch('/api/vision/fs-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: parentPath, name })
      });
      if (!res.ok) throw new Error("Échec de la création du dossier");
      await loadTree();
    }, {
      successMessage: "Dossier créé",
      errorMessage: "Erreur lors de la création"
    });
  };

  const isImageSelected = selectedNode && selectedNode.type === 'file';
  const imageType = isImageSelected ? selectedNode.imageType : null;

  return (
    <VisionContainer>
      {!isEditing && (
        <VisionSidebar
          title="Métadonnées Vision"
          icon={<Box className="w-4 h-4" />}
          iconBgColor="bg-purple-600/20"
          iconColor="text-purple-400"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          tree={tree}
          expandedNodes={expandedNodes}
          onToggleExpand={toggleNode}
          selectedPath={selectedPath ?? undefined}
          onSelectNode={handleSelectNode}
          onRefresh={handleRefresh}
          isLoading={loading || isActionLoading}
          onDelete={handleDeleteNode}
          onRename={handleRenameNode}
          onCreateFolder={handleCreateFolder}
          showIngestionButton={!showIngestion && !showAssembly}
          onIngestionClick={handleStartIngestion}
          showFiles={true}
        />
      )}

      <div className="flex-1 flex flex-col bg-[#0a0a0a]/50 backdrop-blur-md min-w-0 min-h-0">
        {/* Header avec onglets pour les préparations */}
        {!isEditing && (
          <div className="p-8 border-b border-white/5 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="bg-purple-600/20 border-purple-500/30 text-purple-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                {showIngestion ? 'IA Ingestion Pipeline' : showAssembly ? 'Assemblage Panoramique' : 'Metadata Explorer'}
              </Badge>
              {selectedNode && !showIngestion && !showAssembly && (
                <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase tracking-tighter">
                  <FolderSearch className="w-4 h-4" />
                  <span>{selectedNode.path}</span>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              {!showIngestion && !showAssembly && (
                <>
                  <Button 
                    variant="outline" 
                    onClick={handleStartAssembly}
                    className="hover:bg-white/5 text-gray-400 hover:text-white rounded-2xl h-10 px-6 text-[10px] font-black uppercase gap-2 border-white/10"
                  >
                    <Layers className="w-4 h-4" /> Assembler des images
                  </Button>
                  {isImageSelected && imageType !== 'global' && (
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveTab('preparation')}
                      className="hover:bg-purple-600/10 text-purple-400 hover:text-purple-300 rounded-2xl h-10 px-6 text-[10px] font-black uppercase gap-2 border-purple-500/20"
                    >
                      <Settings className="w-4 h-4" /> Préparer l'image
                    </Button>
                  )}
                </>
              )}
              {showIngestion && (
                <Button 
                  variant="ghost" 
                  onClick={() => setShowIngestion(false)}
                  className="hover:bg-white/5 text-gray-400 hover:text-white rounded-2xl h-10 px-6 text-[10px] font-black uppercase gap-2 border border-white/5"
                >
                  <X className="w-4 h-4" /> Annuler Ingestion
                </Button>
              )}
              {showAssembly && (
                <Button 
                  variant="ghost" 
                  onClick={() => setShowAssembly(false)}
                  className="hover:bg-white/5 text-gray-400 hover:text-white rounded-2xl h-10 px-6 text-[10px] font-black uppercase gap-2 border border-white/5"
                >
                  <X className="w-4 h-4" /> Annuler Assemblage
                </Button>
              )}
            </div>
          </div>

          {/* Onglets pour la vue métadonnées avec image sélectionnée */}
          {isImageSelected && !showIngestion && !showAssembly && (
            <div className="mt-6">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                <TabsList className="bg-gray-800/50 border-white/10">
                  <TabsTrigger value="metadata" className="gap-2">
                    <Box className="w-4 h-4" />
                    Métadonnées
                  </TabsTrigger>
                  <TabsTrigger value="preparation" className="gap-2">
                    <Brain className="w-4 h-4" />
                    Préparations
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
          </div>
        )}

        {/* Content Area */}
        <div className={cn(
          "flex-1 min-h-0 relative",
          (showIngestion || showAssembly) ? "overflow-hidden" : "overflow-y-auto p-10 custom-scrollbar"
        )}>
          {showIngestion ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 h-full">
              <IngestionWizard 
                onComplete={() => {
                  setShowIngestion(false);
                  loadTree();
                }}
                onCancel={() => setShowIngestion(false)}
                targetFolders={tree}
              />
            </div>
          ) : showAssembly ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 h-full">
              <AssemblyWizard 
                open={showAssembly} 
                onOpenChange={setShowAssembly}
                targetFolders={tree}
                onAssemblyComplete={(assemblyResult) => {
                  setShowAssembly(false);
                  loadTree();
                  toast({ 
                    title: "✅ Assemblage réussi", 
                    description: `Image assemblée créée avec succès`,
                    variant: "default"
                  });
                  if (assemblyResult?.id) {
                    setSelectedPath(`data/banque_images_ia/${assemblyResult.id}`);
                  }
                }}
              />
            </div>
          ) : selectedNode ? (
            <div className="animate-in fade-in zoom-in-95 duration-500">
              {isImageSelected ? (
                activeTab === 'metadata' ? (
                  <MetadataViewer 
                    node={selectedNode}
                    onRefresh={loadTree}
                    onEditChange={setIsEditing}
                  />
                ) : (
                  <PreparationPanel 
                    imageId={selectedNode.id}
                    imageName={selectedNode.name}
                    onComplete={handlePreparationComplete}
                  />
                )
              ) : (
                <div className="p-12 text-gray-400">
                  <h3 className="text-xl font-bold">Dossier sélectionné</h3>
                  <p className="mt-2">Sélectionnez une image dans la colonne de gauche pour afficher ses métadonnées.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 opacity-20 animate-in fade-in duration-1000">
              <div className="relative">
                <div className="absolute inset-0 bg-purple-500/10 blur-[100px] rounded-full" />
                <div className="relative p-16 bg-white/5 rounded-[5rem] border border-white/5">
                  <Box className="w-40 h-40 text-gray-400" />
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Sélectionnez une image</h3>
                <p className="text-gray-500 font-medium max-w-sm mx-auto">
                  Utilisez la barre latérale pour explorer vos actifs ou lancez une nouvelle analyse IA.
                </p>
              </div>
              <div className="flex gap-3">
                <Button 
                  onClick={handleStartIngestion}
                  className="bg-purple-600 hover:bg-purple-500 rounded-2xl h-14 px-10 text-[11px] font-black uppercase tracking-widest gap-3 shadow-[0_0_30px_rgba(168,85,247,0.3)]"
                >
                  <Sparkles className="w-5 h-5" /> Nouvelle Ingestion IA
                </Button>
                <Button 
                  onClick={handleStartAssembly}
                  variant="outline"
                  className="border-white/10 hover:bg-white/5 rounded-2xl h-14 px-10 text-[11px] font-black uppercase tracking-widest gap-3"
                >
                  <Layers className="w-5 h-5" /> Assembler des images
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </VisionContainer>
  );
}