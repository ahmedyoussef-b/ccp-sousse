// src/components/admin/ImageBank.tsx
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Folder, Upload, FolderPlus, Trash2, Search, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { VisionContainer } from '@/components/vision/shared/components/VisionContainer';
import { VisionSidebar } from '@/components/vision/shared/components/VisionSidebar';
import { useFileSystemTree, type VisionFileNode, type ImageMetadata } from '@/components/vision/shared/hooks/useFileSystemTree';
import { useAsyncAction } from '@/components/vision/shared/hooks/useAsyncAction';
import { useVisionSearch } from '@/hooks/useVisionSearch';
import { ImageGrid } from './components/ImageGrid';
import { ImageDialogs } from './components/ImageDialogs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MetadataViewer } from './components/MetadataViewer';
import VisionResults from '@/components/vision/VisionResults';

export default function ImageBank() {
  const { tree, loading, expandedNodes, loadTree, toggleNode, removeItem, updateItem } = useFileSystemTree();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null);
  
  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [similarSearchOpen, setSimilarSearchOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const { execute, isLoading: isActionLoading } = useAsyncAction();
  const { searchByImageId, registerImage, result: searchResult, isLoading: isSearching, reset: resetSearch } = useVisionSearch();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🔥 Fonction utilitaire pour trouver un nœud parent dans l'arbre
  const findParentNode = useCallback((nodes: VisionFileNode[], parentId: string | null | undefined): VisionFileNode | null => {
    if (!parentId) return null;
    for (const node of nodes) {
      if (node.id === parentId) return node;
      if (node.children) {
        const found = findParentNode(node.children, parentId);
        if (found) return found;
      }
    }
    return null;
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

  useEffect(() => {
    loadTree(false);
  }, [loadTree]);

  const handleSelectNode = (node: VisionFileNode) => {
    setSelectedPath(node.path);
    setSelectedImageIds(new Set());
  };

  const handleRefresh = () => {
    loadTree(false);
    toast({ title: "🔄 Synchronisation", description: "Arborescence mise à jour" });
  };

  // Gestion des images
  const handleViewImage = (image: ImageMetadata) => {
    setSelectedImage(image);
    setViewDialogOpen(true);
  };

  const handleEditImage = (image: ImageMetadata) => {
    setSelectedImage(image);
    setEditDialogOpen(true);
  };

  const handleDeleteImage = (image: ImageMetadata) => {
    setSelectedImage(image);
    setDeleteDialogOpen(true);
  };

  const handleSearchSimilar = async (image: ImageMetadata) => {
    setSelectedImage(image);
    setSimilarSearchOpen(true);
    try {
      await searchByImageId(image.id);
    } catch (err) {
      toast({ 
        title: "Erreur", 
        description: "Échec de la recherche de similarité", 
        variant: "destructive" 
      });
    }
  };

  const handleSaveMetadata = async (imageId: string, metadata: Partial<ImageMetadata>, tags: string[]) => {
    await execute(async () => {
      const res = await fetch(`/api/vision/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...metadata, tags }),
      });
      if (!res.ok) throw new Error('Failed to update');
      updateItem(imageId, { ...metadata, tags });
      return res;
    }, {
      successMessage: "✅ Métadonnées mises à jour",
      errorMessage: "Échec de la mise à jour"
    });
  };

  const handleDeleteSingleImage = async (imageId: string) => {
    await execute(async () => {
      const res = await fetch(`/api/vision/images/${imageId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      removeItem(imageId, 'file');
      return res;
    }, {
      successMessage: "✅ Image supprimée",
      errorMessage: "Échec de la suppression"
    });
  };

  const handleUploadClick = () => {
    if (!selectedNode) {
      toast({ 
        title: "Dossier manquant", 
        description: "Veuillez sélectionner un répertoire ou une image dans la barre latérale pour l'importation.",
        variant: "destructive"
      });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedNode) return;

    await execute(async () => {
      try {
        // 🔥 CORRECTION: Calculer le chemin du dossier parent selon le type de nœud sélectionné
        let targetFolderPath: string;
        let targetFolderId: string;
        let targetFolderName: string;
        
        if (selectedNode.type === 'directory') {
          // Dossier sélectionné : utiliser son chemin directement
          targetFolderPath = selectedNode.path;
          targetFolderId = selectedNode.id;
          targetFolderName = selectedNode.name;
        } else {
          // Image sélectionnée : trouver le dossier parent
          const parentNode = findParentNode(tree, selectedNode.parentId);
          if (parentNode) {
            targetFolderPath = parentNode.path;
            targetFolderId = parentNode.id;
            targetFolderName = parentNode.name;
          } else {
            // Fallback : utiliser la racine
            targetFolderPath = 'data/banque_images_ia';
            targetFolderId = 'root';
            targetFolderName = 'Racine';
          }
        }

        // Préparer les métadonnées avec le dossier cible correct
        const metadata = {
          folderId: targetFolderId,
          targetPath: targetFolderPath, // Maintenant garanti d'être un chemin de dossier
          date: new Date().toISOString()
        };
        
        await registerImage(file, metadata);
        
        toast({ 
          title: "Importation réussie", 
          description: `L'image a été ajoutée au dossier ${targetFolderName}` 
        });
        
        // Rafraîchir l'arborescence pour voir le nouveau fichier
        loadTree();
      } catch (err) {
        toast({ 
          title: "Erreur d'importation", 
          description: err instanceof Error ? err.message : "Une erreur est survenue", 
          variant: "destructive" 
        });
      }
    });
    
    // Réinitialiser l'input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateFolder = async (parentPath: string, name: string) => {
    await execute(async () => {
      const res = await fetch('/api/vision/fs-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: parentPath, name })
      });
      if (!res.ok) throw new Error("Échec de la création du dossier");
      await loadTree(false);
    }, {
      successMessage: "Dossier créé",
      errorMessage: "Erreur lors de la création"
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
      await loadTree(false);
    }, {
      successMessage: "Renommé avec succès",
      errorMessage: "Erreur lors du renommage"
    });
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
      
      removeItem(node.id, isFile ? 'file' : 'directory');
      if (selectedPath === node.path) setSelectedPath(null);
    }, {
      successMessage: "Suppression réussie",
      errorMessage: "Erreur lors de la suppression"
    });
  };

  const handleBulkDelete = async (imageIds: string[]) => {
    const idsToDelete = imageIds.length > 0 ? imageIds : Array.from(selectedImageIds);
    
    await execute(async () => {
      const res = await fetch('/api/vision/images/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds: idsToDelete })
      });
      if (!res.ok) throw new Error('Bulk delete failed');
      idsToDelete.forEach(id => removeItem(id, 'file'));
      setSelectedImageIds(new Set());
      return res;
    }, {
      successMessage: `✅ ${idsToDelete.length} image(s) supprimée(s)`,
      errorMessage: "Échec de la suppression groupée"
    });
  };


  return (
    <>
    {/* FULL-PAGE IMAGE VIEW — sidebar hidden */}
    {selectedNode?.type === 'file' && (
      <div className="fixed inset-0 z-50 bg-[#151515] text-white overflow-y-auto p-4 md:p-8 custom-scrollbar animate-in fade-in duration-300">
        <MetadataViewer
          node={selectedNode}
          onRefresh={loadTree}
          onEditChange={setIsEditing}
          onClose={() => setSelectedPath(null)}
        />
      </div>
    )}

    {/* NORMAL FOLDER VIEW with sidebar */}
    {selectedNode?.type !== 'file' && (
      <VisionContainer>
        {!isEditing && (
          <VisionSidebar
            title="Banque d'images"
            icon={<Folder className="w-4 h-4" />}
            iconBgColor="bg-blue-600/20"
            iconColor="text-blue-400"
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
            onViewDetails={(img) => {
              setSelectedImage(img);
              setViewDialogOpen(true);
            }}
            showFiles={true}
            extraActions={
              <button
                className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
                onClick={() => {
                  const parentPath = selectedNode?.type === 'directory' ? selectedNode.path : 'data/banque_images_ia';
                  const name = prompt("Nom du nouveau dossier :");
                  if (name) handleCreateFolder(parentPath, name);
                }}
                title="Nouveau dossier"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            }
          />
        )}

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Header */}
          {!isEditing && (
            <div className="p-6 border-b border-white/5 bg-black/10 flex justify-between items-center">
              <div>
                {selectedNode ? (
                  <div className="space-y-1">
                    <h3 className="text-xl font-black uppercase tracking-tighter">{selectedNode.name}</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                      {selectedNode.images?.length || 0} images • {selectedNode.children?.length || 0} dossiers
                    </p>
                  </div>
                ) : (
                  <h3 className="text-xl font-black uppercase tracking-tighter opacity-20">Sélectionnez un dossier</h3>
                )}
              </div>
              <div className="flex gap-3">
                {selectedImageIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-xl h-10 px-4 text-[10px] font-black uppercase gap-2"
                    onClick={() => setBulkDeleteDialogOpen(true)}
                  >
                    <Trash2 className="w-4 h-4" /> Supprimer ({selectedImageIds.size})
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl h-10 px-4 text-[10px] font-black uppercase gap-2 border-white/10 hover:bg-white/5"
                  onClick={handleUploadClick}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Importer
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <ImageGrid
              folder={selectedNode}
              searchQuery={searchQuery}
              selectedImageIds={selectedImageIds}
              onSelectImage={(id) => {
                setSelectedImageIds(prev => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onViewImage={handleViewImage}
              onEditImage={handleEditImage}
              onDeleteImage={handleDeleteImage}
              onSearchSimilar={handleSearchSimilar}
            />
          </div>
        </div>
      </VisionContainer>
    )}

      {/* Dialogues */}
      <ImageDialogs
        viewDialogOpen={viewDialogOpen}
        onViewDialogChange={setViewDialogOpen}
        editDialogOpen={editDialogOpen}
        onEditDialogChange={setEditDialogOpen}
        deleteDialogOpen={deleteDialogOpen}
        onDeleteDialogChange={setDeleteDialogOpen}
        bulkDeleteDialogOpen={bulkDeleteDialogOpen}
        onBulkDeleteDialogChange={setBulkDeleteDialogOpen}
        selectedImage={selectedImage}
        onSaveMetadata={handleSaveMetadata}
        onDeleteImage={handleDeleteSingleImage}
        onBulkDelete={handleBulkDelete}
        isSaving={isActionLoading}
        isDeleting={isActionLoading}
        bulkDeleteCount={selectedImageIds.size}
      />

      {/* Similar Search Dialog */}
      <Dialog open={similarSearchOpen} onOpenChange={(open) => {
        setSimilarSearchOpen(open);
        if (!open) resetSearch();
      }}>
        <DialogContent className="max-w-4xl bg-[#0a0a0a] border-white/5 p-0 overflow-hidden rounded-[3rem]">
          <div className="p-8 border-b border-white/5 flex items-center justify-between bg-purple-600/5">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-purple-600/20 rounded-2xl">
                 <Search className="w-6 h-6 text-purple-400" />
               </div>
               <div>
                 <DialogTitle className="text-xl font-black uppercase tracking-tighter">Images Similaires</DialogTitle>
                 <p className="text-xs text-gray-500 font-medium">Analyse vectorielle basée sur {selectedImage?.filename}</p>
               </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSimilarSearchOpen(false)} className="rounded-full hover:bg-white/5">
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {isSearching ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-purple-500/20 blur-[40px] rounded-full animate-pulse" />
                  <Loader2 className="w-16 h-16 animate-spin text-purple-500 relative" />
                </div>
                <p className="text-sm font-black uppercase tracking-widest text-purple-400 animate-pulse">Comparaison vectorielle en cours...</p>
              </div>
            ) : searchResult ? (
              <VisionResults 
                result={searchResult}
                userImageSrc={`/api/vision/images/${selectedImage?.id}`}
                onConfirm={() => setSimilarSearchOpen(false)}
                onRegisterNow={() => {}}
                onRegisterLater={() => {}}
                onRetry={() => searchByImageId(selectedImage!.id)}
                searchMode="vision"
              />
            ) : (
              <div className="py-20 text-center text-gray-500 uppercase font-black tracking-widest text-xs opacity-30">
                Aucun résultat à afficher
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}