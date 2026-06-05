// src/components/document/ImageSelectionDialog.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  Check, 
  X, 
  Tags, 
  Folder, 
  Calendar, 
  Loader2,
  Eye,
  Plus,
  Upload
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ImageSelectionDialogProps {
  documentId: string;
  documentTitle: string;
  linkedImages?: any[];
  onRefreshImages?: () => void;
  triggerButton?: React.ReactNode;
}

export function ImageSelectionDialog({
  documentId,
  documentTitle,
  linkedImages = [],
  onRefreshImages,
  triggerButton
}: ImageSelectionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [images, setImages] = useState<any[]>([]);
  const [filteredImages, setFilteredImages] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [isAssociating, setIsAssociating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !documentId) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const payload = {
        description: `Attaché au document ${documentTitle}`,
        linkedDocumentIds: [documentId],
        folderNamePath: 'Documents', // Dossier par défaut
      };
      
      formData.append('metadata', JSON.stringify(payload));

      const res = await fetch('/api/vision/register', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        toast({ title: 'Image importée et associée avec succès' });
        await fetchImages();
        if (onRefreshImages) onRefreshImages();
        setIsOpen(false);
      } else {
        throw new Error();
      }
    } catch (err) {
      toast({ title: 'Erreur upload', description: 'Impossible d\'importer l\'image.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Charger les images de la banque lors de l'ouverture
  useEffect(() => {
    if (isOpen) {
      fetchImages();
      setSelectedImage(null);
    }
  }, [isOpen]);

  // Effectuer un filtrage local en temps réel
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredImages(images);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = images.filter(img => 
        (img.filename?.toLowerCase() || '').includes(query) ||
        (img.description?.toLowerCase() || '').includes(query) ||
        img.tags?.some((t: string) => t.toLowerCase().includes(query))
      );
      setFilteredImages(filtered);
    }
  }, [searchQuery, images]);

  const fetchImages = async () => {
    setIsLoading(true);
    try {
      // On demande une limite élevée pour pouvoir tout parcourir/filtrer localement
      const res = await fetch('/api/vision/images?limit=100');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.images)) {
          setImages(data.images);
          setFilteredImages(data.images);
        }
      } else {
        throw new Error();
      }
    } catch (err) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger la banque d\'images.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchAPI = async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('textQuery', searchQuery);
      
      const res = await fetch('/api/vision/search', {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.found && Array.isArray(data.matches)) {
          // Mapper les correspondances de recherche au format standard d'image
          const searchedImages = data.matches.map((m: any) => ({
            id: m.id.replace(/^vision_/, ''),
            filename: m.metadata.filename,
            description: m.metadata.description,
            tags: m.metadata.tags,
            folderId: m.metadata.folderId,
            date: m.metadata.date,
            similarity: m.similarity
          }));
          setFilteredImages(searchedImages);
          toast({
            title: 'Recherche IA réussie',
            description: `${searchedImages.length} images correspondantes trouvées.`
          });
        } else {
          setFilteredImages([]);
          toast({
            title: 'Aucun résultat',
            description: 'Aucune image correspondante trouvée par l\'IA.'
          });
        }
      }
    } catch (err) {
      toast({
        title: 'Erreur recherche',
        description: 'Échec de la recherche hybride.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssociate = async (image: any) => {
    if (!documentId) return;
    setIsAssociating(true);
    try {
      // 1. Récupérer les métadonnées actuelles de l'image pour préserver les autres associations
      const detailRes = await fetch(`/api/vision/images/${image.id}?type=metadata`);
      let currentLinkedDocs: string[] = [];
      
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        currentLinkedDocs = detailData.linkedDocumentIds || detailData.linked_document_ids || [];
      }
      
      // Éviter les doublons
      if (!currentLinkedDocs.includes(documentId)) {
        currentLinkedDocs.push(documentId);
      }
      
      // 2. Mettre à jour l'image avec le nouveau document associé
      const patchRes = await fetch(`/api/vision/images/${image.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          linkedDocumentIds: currentLinkedDocs
        })
      });
      
      if (!patchRes.ok) throw new Error('Échec de la mise à jour des métadonnées');

      // 3. Déclencher la réindexation pour rafraîchir ChromaDB et l'index textuel
      await fetch(`/api/vision/images/${image.id}?action=reindex`, {
        method: 'POST'
      });

      toast({
        title: 'Association réussie',
        description: `L'image "${image.filename}" a été liée au document.`
      });

      if (onRefreshImages) onRefreshImages();
      setIsOpen(false);
    } catch (err) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'associer l\'image au document.',
        variant: 'destructive'
      });
    } finally {
      setIsAssociating(false);
    }
  };

  // Vérifier si une image est déjà associée
  const isImageAlreadyLinked = (imageId: string) => {
    return linkedImages.some(img => img.id === imageId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button 
            size="sm"
            variant="outline"
            className="h-7 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border-none text-[10px] font-bold"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Associer
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl bg-[#141414] border border-white/5 rounded-3xl p-6 text-white shadow-2xl overflow-hidden focus:outline-none">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-lg font-black uppercase text-blue-400 tracking-wider flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Banque d'Images de Référence
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs font-medium">
            Sélectionnez une image industrielle déjà indexée et vectorisée pour l'associer au document <span className="text-white font-bold">"{documentTitle}"</span>.
          </DialogDescription>
        </DialogHeader>

        {/* Barre de Recherche et Boutons */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchAPI()}
              placeholder="Rechercher par nom, tag, description..."
              className="bg-black/40 border-white/5 pl-10 text-white rounded-xl h-10 text-xs font-semibold focus:border-blue-500/30 focus:ring-0"
            />
          </div>
          <Button 
            onClick={handleSearchAPI} 
            disabled={isLoading || !searchQuery.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 rounded-xl h-10 transition-colors"
          >
            Recherche IA
          </Button>
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            className="hidden" 
          />
          <Button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isUploading}
            variant="outline"
            className="bg-white/5 hover:bg-white/10 text-white border-white/10 font-bold text-xs px-4 rounded-xl h-10 transition-colors flex items-center gap-1.5"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importer
          </Button>
        </div>

        {/* Zone de contenu principale (Grid images + Panel preview) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[420px] overflow-hidden">
          
          {/* Liste des images (à gauche) */}
          <div className="md:col-span-2 flex flex-col h-full bg-black/20 border border-white/5 rounded-2xl p-4 overflow-hidden">
            <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider mb-3 block">
              Images Disponibles ({filteredImages.length})
            </span>
            
            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <span className="text-xs text-gray-400 font-bold">Chargement de la banque...</span>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-6">
                <ImageIcon className="w-10 h-10 text-gray-600" />
                <span className="text-xs text-gray-400 font-bold">Aucune image trouvée</span>
                <span className="text-[10px] text-gray-500">Essayez un autre mot-clé ou effectuez une recherche IA.</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 grid grid-cols-2 gap-3 scrollbar-thin">
                {filteredImages.map((img, idx) => {
                  const alreadyLinked = isImageAlreadyLinked(img.id);
                  const isSelected = selectedImage?.id === img.id;
                  
                  return (
                    <div
                      key={`${img.id}-${idx}`}
                      onClick={() => setSelectedImage(img)}
                      className={cn(
                        "relative aspect-video rounded-xl overflow-hidden border bg-black/40 cursor-pointer group transition-all duration-300",
                        isSelected 
                          ? "border-blue-500 shadow-blue-500/10 shadow-lg scale-[0.98]" 
                          : "border-white/5 hover:border-white/20",
                        alreadyLinked && "opacity-60"
                      )}
                    >
                      {/* Image de fond */}
                      <img 
                        src={`/api/vision/image-source?id=${img.id}`} 
                        alt={img.filename} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      
                      {/* Overlay dégradé */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2.5 flex flex-col justify-end">
                        <span className="text-[10px] font-black text-white truncate drop-shadow block uppercase tracking-tight">
                          {img.filename}
                        </span>
                        
                        {/* Similarity badge for AI Search */}
                        {img.similarity !== undefined && (
                          <div className="absolute top-2 right-2">
                            <Badge className="bg-green-600/80 text-white font-bold text-[9px] h-5 rounded-md px-1.5">
                              {Math.round(img.similarity * 100)}% Match
                            </Badge>
                          </div>
                        )}
                        
                        {/* Already linked overlay/badge */}
                        {alreadyLinked && (
                          <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-[1px] flex items-center justify-center gap-1.5">
                            <div className="bg-blue-600/90 text-white p-1 rounded-full">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-white">Associée</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Panel de Preview (à droite) */}
          <div className="flex flex-col h-full bg-[#181818] border border-white/5 rounded-2xl p-4 overflow-hidden">
            {selectedImage ? (
              <div className="flex flex-col h-full overflow-hidden">
                <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider mb-3 block">
                  Détails de l'image sélectionnée
                </span>
                
                {/* Visual Preview */}
                <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-white/5 mb-4 bg-black">
                  <img 
                    src={`/api/vision/image-source?id=${selectedImage.id}`} 
                    alt={selectedImage.filename} 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    <Badge variant="outline" className="bg-black/80 border-white/10 text-gray-300 text-[9px] uppercase font-bold rounded-lg px-2 py-0.5">
                      {selectedImage.imageType || selectedImage.image_type || 'Simple'}
                    </Badge>
                  </div>
                </div>

                {/* Metadata Details */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                  <div>
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">
                      Nom du fichier
                    </span>
                    <span className="text-xs font-bold text-white uppercase block leading-tight">
                      {selectedImage.filename}
                    </span>
                  </div>

                  {selectedImage.description && (
                    <div>
                      <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">
                        Analyse IA / Description
                      </span>
                      <p className="text-[11px] font-medium text-gray-300 leading-relaxed max-h-20 overflow-y-auto scrollbar-thin">
                        {selectedImage.description}
                      </p>
                    </div>
                  )}

                  {selectedImage.tags && selectedImage.tags.length > 0 && (
                    <div>
                      <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">
                        Tags Vectorisés
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedImage.tags.slice(0, 8).map((tag: string) => (
                          <Badge key={tag} className="bg-blue-600/10 text-blue-400 border border-blue-500/20 text-[9px] h-5 rounded-md px-1.5">
                            {tag}
                          </Badge>
                        ))}
                        {selectedImage.tags.length > 8 && (
                          <Badge className="bg-white/5 text-gray-400 border-none text-[9px] h-5 rounded-md px-1.5">
                            +{selectedImage.tags.length - 8}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold">
                      <Folder className="w-3.5 h-3.5 text-gray-500" />
                      <span>{selectedImage.folderId || 'Banque'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold">
                      <Calendar className="w-3.5 h-3.5 text-gray-500" />
                      <span>{selectedImage.date ? new Date(selectedImage.date).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Association Action Button */}
                <div className="pt-4 mt-auto">
                  {isImageAlreadyLinked(selectedImage.id) ? (
                    <Button 
                      disabled
                      className="w-full bg-blue-600/20 text-blue-400 font-bold text-xs rounded-xl h-10 flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      Déjà associée au document
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => handleAssociate(selectedImage)}
                      disabled={isAssociating}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl h-10 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {isAssociating ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <LinkIcon className="w-4 h-4 mr-1" />
                      )}
                      Associer au document
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-gray-500">
                <Eye className="w-8 h-8 text-gray-700" />
                <span className="text-xs font-bold">Sélectionnez une image</span>
                <span className="text-[10px]">Cliquez sur une image dans la banque pour voir ses métadonnées et l'associer.</span>
              </div>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
