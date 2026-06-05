// components/vision/EnhancedVisionConfirmDialog.tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/components/ui/tagInput';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Folder, Loader2, ImageOff } from 'lucide-react';
import { VisionFolder } from '@/types/vision';
import { ImageRegistrationMetadata } from './shared/types/type';

interface EnhancedVisionConfirmDialogProps {
  open: boolean;
  imageSrc: string;
  imageFile?: File;
  suggestedMetadata?: {
    tags?: string[];
    description?: string;
    equipmentType?: string;
  };
  initialFolderId?: string;
  onConfirm: (metadata: ImageRegistrationMetadata) => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export default function EnhancedVisionConfirmDialog({
  open,
  imageSrc,
  imageFile,
  suggestedMetadata,
  initialFolderId,
  onConfirm,
  onCancel,
  isProcessing = false
}: EnhancedVisionConfirmDialogProps) {
  const [filename, setFilename] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [folderId, setFolderId] = useState<string>('root');
  const [folders, setFolders] = useState<VisionFolder[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [imageType, setImageType] = useState<'global' | 'simple'>('simple');
  
  // ✅ Vérifier si l'image est valide
  const hasValidImage = imageSrc && imageSrc.length > 0;
  
  // Charger les dossiers via l'API
  useEffect(() => {
    const loadFolders = async () => {
      setIsLoadingFolders(true);
      try {
        const response = await fetch('/api/vision/folders');
        if (!response.ok) {
          throw new Error('Erreur chargement dossiers');
        }
        const data = await response.json();
        if (data.success && data.folders) {
          setFolders(data.folders);
        } else {
          throw new Error('Format de réponse invalide');
        }
      } catch (error) {
        console.error('Erreur chargement dossiers:', error);
        // Fallback : dossier racine uniquement
        setFolders([{ 
          id: 'root', 
          name: 'Racine', 
          parentId: null, 
          createdAt: new Date().toISOString() 
        }]);
      } finally {
        setIsLoadingFolders(false);
      }
    };
    
    if (open) {
      loadFolders();
    }
  }, [open]);
  
  // Pré-remplir avec les suggestions
  useEffect(() => {
    if (suggestedMetadata) {
      if (suggestedMetadata.tags && suggestedMetadata.tags.length > 0) {
        setTags(prev => [...new Set([...prev, ...suggestedMetadata.tags!])]);
      }
      if (suggestedMetadata.description && !description) {
        setDescription(suggestedMetadata.description);
      }
    }
  }, [suggestedMetadata, description]);
  
  // Réinitialiser le formulaire quand le dialogue s'ouvre
  useEffect(() => {
    if (open) {
      if (!suggestedMetadata) {
        setFilename(imageFile?.name || '');
        setDescription('');
        setTags([]);
        setLocation('');
        setFolderId(initialFolderId || 'root');
        setImageType('simple');
      }
    }
  }, [open, suggestedMetadata, imageFile, initialFolderId]);
  
  // Générer des suggestions automatiques via l'API
  const generateSuggestions = async () => {
    if (!imageFile) return;
    
    setIsGeneratingSuggestions(true);
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('filename', filename || imageFile.name);
      
      const response = await fetch('/api/vision/suggestions', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur suggestions');
      }
      
      const data = await response.json();
      
      // Mettre à jour les tags
      if (data.tags && data.tags.length > 0) {
        setTags(prev => [...new Set([...prev, ...data.tags])]);
      }
      
      // Suggérer une description si vide
      if (!description && data.equipmentType) {
        const desc = `Équipement: ${data.equipmentType} - Zone: ${data.zone}`;
        setDescription(desc);
      }
      
      // ✅ V2: Utiliser la suggestion de dossier directe
      if (data.suggestedFolderId && data.suggestedFolderId !== 'root') {
        setFolderId(data.suggestedFolderId);
        console.log(`[UI] Dossier auto-suggéré: ${data.suggestedFolderId}`);
      } else if (data.zone || data.equipmentType) {
        // Fallback sur le matching de zone
        const matchingFolder = folders.find(f => {
          const folderName = f.name.toLowerCase();
          const zone = (data.zone || '').toLowerCase();
          const equipType = (data.equipmentType || '').toLowerCase();
          return folderName.includes(zone) || folderName.includes(equipType);
        });
        if (matchingFolder) {
          setFolderId(matchingFolder.id);
        }
      }
      
      // Suggérer un nom de fichier si vide
      if (!filename && data.equipmentType) {
        const date = new Date().toISOString().split('T')[0];
        const safeName = `${data.equipmentType}_${data.zone}_${date}`
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .toLowerCase();
        setFilename(`${safeName}.jpg`);
      }
      
      // Suggérer une localisation si vide
      if (!location && data.zone) {
        setLocation(data.zone);
      }
      
    } catch (error) {
      console.error('Erreur génération suggestions:', error);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };
  
  const handleConfirm = () => {
    onConfirm({
      filename: filename || `image-${Date.now()}.jpg`,
      description: description || '',
      tags: tags,
      location: location || '',
      folderId: folderId !== 'root' ? folderId : undefined,
      imageType: imageType,
    });
  };
  
  // Construire l'arborescence des dossiers pour l'affichage
  const buildFolderPath = (folderId: string): string => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return 'Racine';
    if (!folder.parentId) return folder.name;
    return `${buildFolderPath(folder.parentId)} / ${folder.name}`;
  };
  
  return (
    <Dialog open={open} onOpenChange={() => onCancel()}>
      <DialogContent className="bg-gray-900 text-white border-gray-700 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            Enregistrer l'image
            {imageFile && (
              <Button
                variant="outline"
                size="sm"
                onClick={generateSuggestions}
                disabled={isGeneratingSuggestions}
                className="ml-auto bg-purple-600/20 border-purple-500/30 text-purple-400 hover:bg-purple-600/30"
                title="Générer des suggestions automatiques par IA"
              >
                {isGeneratingSuggestions ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    Analyse IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    Suggérer (IA)
                  </>
                )}
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6 py-4">
          {/* Aperçu */}
          <div className="space-y-3">
            <div className="relative">
              {hasValidImage ? (
                <img 
                  src={imageSrc} 
                  alt="Preview" 
                  className="w-full rounded-lg border border-gray-700 object-contain bg-gray-800/50"
                  style={{ maxHeight: '300px' }}
                />
              ) : (
                <div className="w-full h-48 bg-gray-800/50 rounded-lg border border-gray-700 flex flex-col items-center justify-center">
                  <ImageOff className="w-8 h-8 text-gray-500 mb-2" />
                  <p className="text-sm text-gray-500">Aperçu non disponible</p>
                </div>
              )}
            </div>
            
            {suggestedMetadata?.equipmentType && (
              <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30">
                🔍 Type détecté : {suggestedMetadata.equipmentType}
              </Badge>
            )}
            
            {imageFile && (
              <p className="text-xs text-gray-500">
                Taille : {(imageFile.size / 1024).toFixed(1)} Ko
              </p>
            )}
          </div>

          {/* Formulaire enrichi */}
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                Nom du fichier <span className="text-red-400">*</span>
              </label>
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="ex: pompe-crf-2026.jpg"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            
            <div>
              <label className="text-sm text-gray-400 mb-1 block flex items-center gap-2">
                <Folder className="w-3.5 h-3.5" />
                Dossier
              </label>
              <Select 
                value={folderId} 
                onValueChange={setFolderId} 
                disabled={isLoadingFolders}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Sélectionner un dossier">
                    {folderId !== 'root' ? buildFolderPath(folderId) : '📁 Racine'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-white max-h-60">
                  <SelectItem value="root">📁 Racine</SelectItem>
                  {folders.filter(f => f.id !== 'root').map(folder => (
                    <SelectItem key={folder.id} value={folder.id}>
                      📁 {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isLoadingFolders && (
                <p className="text-xs text-gray-500 mt-1">Chargement des dossiers...</p>
              )}
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                Type de classification
              </label>
              <Select value={imageType} onValueChange={(val: 'global' | 'simple') => setImageType(val)}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Type d'image" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-white">
                  <SelectItem value="simple">🔍 Simple (Détail, Composant, Pompe...)</SelectItem>
                  <SelectItem value="global">🌐 Globale (Pupitre de contrôle, Ensemble...)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                Tags
              </label>
              <TagInput
                value={tags}
                onChange={setTags}
                placeholder="Appuyez sur Entrée pour ajouter"
                className="bg-gray-800 border-gray-700"
              />
              <p className="text-xs text-gray-500 mt-1">
                Ex: turbine, maintenance, critique
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                Localisation
              </label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ex: Salle de contrôle, TG1, Atelier"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description détaillée de l'image..."
                rows={4}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {tags.length > 0 && (
              <span>{tags.length} tag{tags.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isProcessing}
              className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isProcessing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}