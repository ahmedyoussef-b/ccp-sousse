// src/app/industrial-vision/references/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VisionNavigation } from '@/components/industrial-vision/VisionNavigation';
import {
  CheckCircle,
  AlertTriangle,
  Power,
  Upload,
  Trash2,
  Image as ImageIcon,
  RefreshCw} from 'lucide-react';

interface ReferenceImage {
  id: string;
  nom: string;
  type: string;
  chemin: string;
  dateAjout: string;
  thumbnail?: string;
}

// Composant de bouton retour simple

export default function ReferencesPage() {
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('marche_normale');
  const [uploading, setUploading] = useState(false);

  const types = [
    { id: 'marche_normale', label: 'Marche normale', icon: CheckCircle, color: 'green' },
    { id: 'arret_normale', label: 'Arrêt normal', icon: Power, color: 'yellow' },
    { id: 'defaut', label: 'Défaut', icon: AlertTriangle, color: 'red' }
  ];

  const loadReferences = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/industrial-vision/reference?type=${selectedType}`);
      const data = await response.json();
      if (data.success) {
        setReferences(data.data || []);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('image', files[0]);
    formData.append('type', selectedType);

    try {
      const response = await fetch('/api/industrial-vision/reference', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        await loadReferences();
      }
    } catch (error) {
      console.error('Erreur upload:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette référence ?')) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/industrial-vision/reference?id=${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        await loadReferences();
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReferences();
  }, [selectedType]);

  const stats = {
    total: references.length,
    parType: types.map(t => ({
      ...t,
      count: references.filter(r => r.type === t.id).length
    }))
  };

  const getImageUrl = (chemin: string) => {
    return `/api/documents/raw?path=${encodeURIComponent(chemin)}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Navigation */}
      <VisionNavigation currentPage="Références" />
      
      {/* En-tête */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <ImageIcon className="h-8 w-8 text-cyan-500" />
          Références Vision Industrielle
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Gérez les images de référence pour les trois états : Marche normale, Arrêt normal, Défaut
        </p>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {stats.parType.map((type) => {
          const Icon = type.icon;
          return (
            <Card 
              key={type.id}
              className={`cursor-pointer border-l-4 border-l-${type.color}-500 ${
                selectedType === type.id ? 'ring-2 ring-cyan-500' : ''
              }`}
              onClick={() => setSelectedType(type.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{type.label}</p>
                    <p className="text-2xl font-bold">{type.count}</p>
                  </div>
                  <Icon className={`h-8 w-8 text-${type.color}-500 opacity-50`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upload et liste */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {types.find(t => t.id === selectedType)?.icon && 
                React.createElement(types.find(t => t.id === selectedType)!.icon, { className: "h-5 w-5" })
              }
              {types.find(t => t.id === selectedType)?.label}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadReferences} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Rafraîchir
              </Button>
              <div>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleUpload}
                  className="hidden"
                  id="reference-upload"
                  disabled={uploading}
                />
                <Button asChild disabled={uploading}>
                  <label htmlFor="reference-upload" className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? 'Upload...' : 'Ajouter'}
                  </label>
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {references.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Aucune référence pour {types.find(t => t.id === selectedType)?.label}</p>
              <p className="text-sm">Ajoutez des images pour servir de référence</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {references.map((ref) => (
                <div key={ref.id} className="group relative">
                  <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                    <img
                      src={getImageUrl(ref.chemin)}
                      alt={ref.nom}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder-image.png';
                      }}
                    />
                  </div>
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 w-6 p-0"
                      onClick={() => handleDelete(ref.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs truncate mt-1">{ref.nom}</p>
                  <p className="text-[10px] text-gray-500">
                    {new Date(ref.dateAjout).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guide d'utilisation */}
      <Card className="mt-6 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="p-4">
          <h3 className="font-medium mb-2">📖 Guide des références</h3>
          <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
            <li>• <span className="font-medium text-green-600">Marche normale</span> : Image où tous les voyants sont verts, mesures nominales</li>
            <li>• <span className="font-medium text-yellow-600">Arrêt normal</span> : Installation à l&apos;arrêt, voyants éteints ou jaunes</li>
            <li>• <span className="font-medium text-red-600">Défaut</span> : Image avec voyant rouge, mesures hors normes</li>
            <li>• Plus il y a de références, meilleure est la classification</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}