// components/vision/VisionConfirmDialog.tsx
'use client';

import { useState } from 'react';
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
import { TagInput } from '../ui/tagInput';
import { ImageRegistrationMetadata } from './shared/types/type';

interface VisionConfirmDialogProps {
  open: boolean;
  imageSrc: string;
  onConfirm: (metadata: ImageRegistrationMetadata) => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export default function VisionConfirmDialog({
  open,
  imageSrc,
  onConfirm,
  onCancel,
  isProcessing = false
}: VisionConfirmDialogProps) {
  const [filename, setFilename] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [location, setLocation] = useState('');

  const handleConfirm = () => {
    onConfirm({
      filename: filename || `image-${Date.now()}.jpg`,
      description,
      tags,
      location
    });
  };

  return (
    <Dialog open={open} onOpenChange={() => onCancel()}>
      <DialogContent className="bg-gray-900 text-white border-gray-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Enregistrer l'image</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6 py-4">
          {/* Aperçu */}
          <div>
            <img 
              src={imageSrc} 
              alt="Preview" 
              className="w-full rounded-lg border border-gray-700"
            />
          </div>

          {/* Formulaire */}
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                Nom du fichier
              </label>
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="ex: document-important.jpg"
                className="bg-gray-800 border-gray-700"
              />
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
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                Localisation
              </label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ex: Bureau, Laboratoire, etc."
                className="bg-gray-800 border-gray-700"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description de l'image..."
                rows={4}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isProcessing ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}