// src/components/admin/components/ImageDialogs.tsx - VERSION CORRIGÉE
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Sparkles, X, FileText, Calendar, MapPin, Tag } from 'lucide-react';
import { ImageMetadata, VisionFileNode } from '@/components/vision/shared/hooks/useFileSystemTree';
import { MetadataViewer } from './MetadataViewer';

interface ImageDialogsProps {
  viewDialogOpen: boolean;
  onViewDialogChange: (open: boolean) => void;
  editDialogOpen: boolean;
  onEditDialogChange: (open: boolean) => void;
  deleteDialogOpen: boolean;
  onDeleteDialogChange: (open: boolean) => void;
  bulkDeleteDialogOpen: boolean;
  onBulkDeleteDialogChange: (open: boolean) => void;
  selectedImage: ImageMetadata | null;
  onSaveMetadata: (imageId: string, metadata: Partial<ImageMetadata>, tags: string[]) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  onBulkDelete: (imageIds: string[]) => Promise<void>;
  isSaving?: boolean;
  isDeleting?: boolean;
  bulkDeleteCount?: number;
}

// Composant TagInput réutilisable
const TagInput = ({ 
  value, 
  onChange, 
  placeholder 
}: { 
  value: string[]; 
  onChange: (tags: string[]) => void; 
  placeholder?: string;
}) => {
  const [inputValue, setInputValue] = useState('');

  const addTag = () => {
    if (inputValue.trim() && !value.includes(inputValue.trim())) {
      onChange([...value, inputValue.trim()]);
      setInputValue('');
    }
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-gray-800 border border-gray-700 rounded-md min-h-[42px]">
      {value.map((tag, idx) => (
        <span key={idx} className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded-full flex items-center gap-1">
          {tag}
          <button onClick={() => removeTag(tag)} className="hover:text-red-400">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={placeholder || "Ajouter un tag..."}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        className="bg-transparent text-white text-sm outline-none flex-1 min-w-[100px]"
      />
    </div>
  );
};

export function ImageDialogs({
  viewDialogOpen,
  onViewDialogChange,
  editDialogOpen,
  onEditDialogChange,
  deleteDialogOpen,
  onDeleteDialogChange,
  bulkDeleteDialogOpen,
  onBulkDeleteDialogChange,
  selectedImage,
  onSaveMetadata,
  onDeleteImage,
  onBulkDelete,
  isSaving = false,
  isDeleting = false,
  bulkDeleteCount = 0
}: ImageDialogsProps) {
  const [editedMetadata, setEditedMetadata] = useState<Partial<ImageMetadata>>({});
  const [editedTags, setEditedTags] = useState<string[]>([]);

  // Reset edit form when opening
  const handleEditOpen = (open: boolean) => {
    if (open && selectedImage) {
      setEditedMetadata({
        filename: selectedImage.filename,
        description: selectedImage.description || '',
        location: selectedImage.location || '',
        qaPairs: selectedImage.qaPairs || '',
        invocationKeywords: selectedImage.invocationKeywords || '',
        equipmentState: selectedImage.equipmentState || 'normal',
        validUntil: selectedImage.validUntil || '',
        linkedProcedure: selectedImage.linkedProcedure || '',
        zoneId: selectedImage.zoneId || '',
        circuitId: selectedImage.circuitId || '',
        parameterId: selectedImage.parameterId || '',
      });
      setEditedTags(selectedImage.tags || []);
    }
    onEditDialogChange(open);
  };

  const handleSave = async () => {
    if (!selectedImage) return;
    await onSaveMetadata(selectedImage.id, editedMetadata, editedTags);
    onEditDialogChange(false);
  };

  const handleDelete = async () => {
    if (!selectedImage) return;
    await onDeleteImage(selectedImage.id);
    onDeleteDialogChange(false);
  };

  const handleBulkDelete = async () => {
    await onBulkDelete([]);
    onBulkDeleteDialogChange(false);
  };

  return (
    <>
      {/* Dialogue de visualisation */}
      <Dialog open={viewDialogOpen} onOpenChange={onViewDialogChange}>
        <DialogContent className="bg-gray-900 text-white border-gray-700 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails de l'image</DialogTitle>
          </DialogHeader>
          
          {selectedImage && (
            <div className="py-4">
              <MetadataViewer 
                node={{
                  id: selectedImage.id,
                  name: selectedImage.filename,
                  path: selectedImage.path || selectedImage.id,
                  type: 'file',
                  imageType: selectedImage.imageType as any
                }}
                onRefresh={async () => {
                   // Optional: refresh parent
                }}
              />
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => onViewDialogChange(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue d'édition des métadonnées */}
      <Dialog open={editDialogOpen} onOpenChange={handleEditOpen}>
        <DialogContent className="bg-gray-900 text-white border-gray-700 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Métadonnées enrichies
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-400">
              Ces informations permettent à l'IA de retrouver cette image lors des conversations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Informations de base */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-purple-400 border-b border-gray-700 pb-2">
                📋 Informations de base
              </h3>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Nom du fichier</label>
                <Input
                  value={editedMetadata.filename || ''}
                  onChange={(e) => setEditedMetadata({ ...editedMetadata, filename: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-blue-400 border-b border-gray-700 pb-2">
                🏷️ Tags sémantiques
              </h3>
              <p className="text-xs text-gray-500">Ces tags aident l'IA à retrouver l'image par similarité textuelle.</p>
              <TagInput value={editedTags} onChange={setEditedTags} placeholder="ex: turbine, maintenance, alarme..." />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditedTags([...editedTags, 'pupitre'])} className="text-xs h-7 bg-gray-800">
                  + pupitre
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditedTags([...editedTags, 'commande'])} className="text-xs h-7 bg-gray-800">
                  + commande
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditedTags([...editedTags, 'TG1'])} className="text-xs h-7 bg-gray-800">
                  + TG1
                </Button>
              </div>
            </div>

            {/* Questions/Réponses */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-green-400 border-b border-gray-700 pb-2">
                ❓ Questions/Réponses associées
              </h3>
              <p className="text-xs text-gray-500">L'IA utilisera ces paires pour répondre aux questions et proposer cette image.</p>
              <Textarea
                value={editedMetadata.qaPairs || ''}
                onChange={(e) => setEditedMetadata({ ...editedMetadata, qaPairs: e.target.value })}
                placeholder={`[\n  {\n    "question": "...",\n    "answer": "...",\n  }\n]`}
                rows={4}
                className="bg-gray-800 border-gray-700 text-white font-mono text-xs"
              />
            </div>

            {/* Mots-clés d'invocation */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-yellow-400 border-b border-gray-700 pb-2">
                🔑 Mots-clés d'invocation
              </h3>
              <Input
                value={editedMetadata.invocationKeywords || ''}
                onChange={(e) => setEditedMetadata({ ...editedMetadata, invocationKeywords: e.target.value })}
                placeholder="pupitre, tableau de commande, interface opérateur"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            {/* État et validité */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">État de l'équipement</label>
                <select
                  value={editedMetadata.equipmentState || 'normal'}
                  onChange={(e) => setEditedMetadata({ ...editedMetadata, equipmentState: e.target.value as any })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                >
                  <option value="normal">✅ Normal</option>
                  <option value="degraded">⚠️ Dégradé</option>
                  <option value="critical">🔴 Critique</option>
                  <option value="maintenance">🔧 En maintenance</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Date de validité</label>
                <Input
                  type="date"
                  value={editedMetadata.validUntil || ''}
                  onChange={(e) => setEditedMetadata({ ...editedMetadata, validUntil: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>

            {/* Localisation et description */}
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Localisation</label>
                <Input
                  value={editedMetadata.location || ''}
                  onChange={(e) => setEditedMetadata({ ...editedMetadata, location: e.target.value })}
                  placeholder="ex: Salle de contrôle, TG1, Armoire A"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Description (RAG)</label>
                <Textarea
                  value={editedMetadata.description || ''}
                  onChange={(e) => setEditedMetadata({ ...editedMetadata, description: e.target.value })}
                  placeholder="Description détaillée qui sera indexée dans le moteur de recherche..."
                  rows={3}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>

            {/* Procédure associée */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-orange-400 border-b border-gray-700 pb-2">
                📄 Procédure associée
              </h3>
              <Input
                value={editedMetadata.linkedProcedure || ''}
                onChange={(e) => setEditedMetadata({ ...editedMetadata, linkedProcedure: e.target.value })}
                placeholder="ex: DEMARRAGE_TG1, ARRET_URGENCE"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            {/* Hiérarchie Industrielle */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-amber-400 border-b border-gray-700 pb-2">
                🏗️ Hiérarchie Industrielle
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">ID Zone</label>
                  <Input
                    value={editedMetadata.zoneId || ''}
                    onChange={(e) => setEditedMetadata({ ...editedMetadata, zoneId: e.target.value })}
                    placeholder="Ex: A0"
                    className="bg-gray-800 border-gray-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">ID Circuit</label>
                  <Input
                    value={editedMetadata.circuitId || ''}
                    onChange={(e) => setEditedMetadata({ ...editedMetadata, circuitId: e.target.value })}
                    placeholder="Ex: B1-02"
                    className="bg-gray-800 border-gray-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">ID Paramètre</label>
                  <Input
                    value={editedMetadata.parameterId || ''}
                    onChange={(e) => setEditedMetadata({ ...editedMetadata, parameterId: e.target.value })}
                    placeholder="Ex: TEMP-01"
                    className="bg-gray-800 border-gray-700 text-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onEditDialogChange(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue de confirmation suppression unique */}
      <Dialog open={deleteDialogOpen} onOpenChange={onDeleteDialogChange}>
        <DialogContent className="bg-gray-900 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Êtes-vous sûr de vouloir supprimer cette image ? Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onDeleteDialogChange(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue de suppression groupée */}
      <Dialog open={bulkDeleteDialogOpen} onOpenChange={onBulkDeleteDialogChange}>
        <DialogContent className="bg-gray-900 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle>Suppression groupée</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Êtes-vous sûr de vouloir supprimer les <span className="font-bold text-red-400">{bulkDeleteCount}</span> images sélectionnées ? 
            Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onBulkDeleteDialogChange(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Supprimer la sélection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}