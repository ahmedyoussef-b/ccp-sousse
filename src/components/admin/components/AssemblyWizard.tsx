// src/components/admin/components/AssemblyWizard.tsx

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { 
  Plus, 
  Play, 
  Save, 
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Image,
  ZoomIn,
  ArrowUpDown,
  Settings
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';

// Types
interface AssemblyImage {
  id: string;
  filename: string;
  url: string;
  thumbnail?: string;
  selected?: boolean;
  position?: {
    row: number;
    col: number;
  };
}

interface AssemblyResult {
  id: string;
  url: string;
  quality: number;
  width?: number;
  height?: number;
}

// Définition du type VisionFileNode qui était manquant
interface VisionFileNode {
  id: string;
  name: string;
  path: string;
  type: 'directory' | 'file';
  parentId?: string | null;
  children?: VisionFileNode[];
  images?: any[];
  imageCount?: number;
  hasChildren?: boolean;
}

interface AssemblyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssemblyComplete?: (result: AssemblyResult) => void;
  initialImages?: AssemblyImage[];
  folderId?: string;
  targetFolders?: VisionFileNode[];
}

// Composant principal
export function AssemblyWizard({ 
  open, 
  onOpenChange, 
  onAssemblyComplete, 
  initialImages = [],
  targetFolders = [],
  folderId: initialFolderId 
}: AssemblyWizardProps) {
  
  // États
  const [step, setStep] = useState<'select' | 'configure' | 'assemble' | 'complete'>('select');
  const [images, setImages] = useState<AssemblyImage[]>(initialImages);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);
  const [autoDetectGrid, setAutoDetectGrid] = useState(true);
  const [assemblyName, setAssemblyName] = useState('');
  const [assemblyDescription, setAssemblyDescription] = useState('');
  const [targetFolder, setTargetFolder] = useState<string>(initialFolderId || 'root');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isAssembling, setIsAssembling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AssemblyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chargement des images de la banque - Déclaré AVANT le useEffect qui l'utilise
  const loadImages = useCallback(async () => {
    try {
      const response = await fetch('/api/vision/images?limit=100');
      if (response.ok) {
        const data = await response.json();
        const formattedImages = data.images.map((img: any) => ({
          id: img.id,
          filename: img.filename,
          url: `/api/vision/images/${img.id}?type=image`,
          thumbnail: `/api/vision/images/${img.id}?type=thumbnail`
        }));
        setImages(formattedImages);
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de charger les images de la banque",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error('Erreur chargement images:', err);
      toast({
        title: "Erreur réseau",
        description: "Vérifiez la connexion au serveur vision",
        variant: "destructive"
      });
    }
  }, []);

  // Chargement initial - Utilise loadImages qui est maintenant déclarée avant
  useEffect(() => {
    if (open && step === 'select') {
      loadImages();
    }
  }, [open, step, loadImages]);

  // Détection auto de la grille
  const detectGridAuto = useCallback(async () => {
    if (selectedImages.length === 0) return;
    
    try {
      const response = await fetch('/api/vision/assemble/detect-grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds: selectedImages })
      });
      
      if (response.ok) {
        const data = await response.json();
        setGridRows(data.rows || Math.ceil(Math.sqrt(selectedImages.length)));
        setGridCols(data.cols || Math.ceil(Math.sqrt(selectedImages.length)));
        // Désactiver la détection automatique pour montrer le résultat à l'utilisateur
        setAutoDetectGrid(false);
        toast({
          title: "Optimisation terminée",
          description: `Grille détectée : ${data.rows} lignes x ${data.cols} colonnes (${data.method})`,
        });
      } else {
        // Fallback: grille carrée approximative
        const size = Math.ceil(Math.sqrt(selectedImages.length));
        setGridRows(size);
        setGridCols(size);
        setAutoDetectGrid(false);
      }
    } catch (err) {
      const size = Math.ceil(Math.sqrt(selectedImages.length));
      setGridRows(size);
      setGridCols(size);
      setAutoDetectGrid(false);
    }
  }, [selectedImages]);

  // Détection des chevauchements
  const detectOverlap = useCallback(async () => {
    if (selectedImages.length < 2) return;
    
    try {
      const response = await fetch('/api/vision/assemble/detect-overlap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds: selectedImages })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Chevauchement détecté",
          description: `${data.overlapPercent}% de chevauchement moyen détecté`,
        });
      }
    } catch (err) {
      console.error('Erreur détection chevauchement:', err);
    }
  }, [selectedImages]);

  // Lancer l'assemblage
  const startAssembly = useCallback(async () => {
    if (selectedImages.length === 0) {
      toast({
        title: "Erreur",
        description: "Sélectionnez au moins 2 images à assembler",
        variant: "destructive"
      });
      return;
    }

    setIsAssembling(true);
    setProgress(0);
    setError(null);
    setStep('assemble');

    try {
      // Phase 1: Initialisation
      setProgress(10);
      
      const response = await fetch('/api/vision/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: selectedImages,
          gridRows: autoDetectGrid ? undefined : gridRows,
          gridCols: autoDetectGrid ? undefined : gridCols,
          name: assemblyName || `Assemblage_${new Date().toISOString().slice(0,19)}`,
          description: assemblyDescription,
          tags: tags,
          folderId: targetFolder,
          autoAlign: true,
          blendMode: 'feather' 
        })
      });

      // Phase 2: Traitement terminé
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erreur lors de l'assemblage");
      }

      setProgress(90);
      const data = await response.json();
      setProgress(100);
      setResult(data.assembly);
      setStep('complete');
      
      toast({
        title: "Assemblage réussi !",
        description: `Image assemblée : ${data.assembly.id}`,
      });

      if (onAssemblyComplete) {
        onAssemblyComplete(data.assembly);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      toast({
        title: "Erreur d'assemblage",
        description: err instanceof Error ? err.message : "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setIsAssembling(false);
    }
  }, [selectedImages, gridRows, gridCols, autoDetectGrid, assemblyName, assemblyDescription, tags, targetFolder, onAssemblyComplete]);

  // Basculer sélection d'une image
  const toggleImageSelection = (imageId: string) => {
    setSelectedImages(prev => 
      prev.includes(imageId) 
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    );
  };

  // Ajouter un tag
  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  // Supprimer un tag
  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  // Réinitialiser
  const reset = () => {
    setStep('select');
    setSelectedImages([]);
    setAssemblyName('');
    setAssemblyDescription('');
    setTags([]);
    setResult(null);
    setError(null);
    setProgress(0);
    setGridRows(2);
    setGridCols(2);
  };

  // Fermer - Fonction utilisée dans le rendu
  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // Fonction pour aplatir les dossiers pour le select avec gestion des niveaux
  const flattenFolders = (nodes: VisionFileNode[], level = 0): (VisionFileNode & { level: number })[] => {
    let result: (VisionFileNode & { level: number })[] = [];
    nodes.forEach(node => {
      if (node.type === 'directory') {
        result.push({ ...node, level });
        if (node.children && node.children.length > 0) {
          result = result.concat(flattenFolders(node.children, level + 1));
        }
      }
    });
    return result;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="mb-6">
          <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Assemblage Panoramique</h2>
          <p className="text-gray-500 font-medium text-sm">
            Assemblez plusieurs images partielles en une image globale parfaite
          </p>
        </div>
 <Button variant="ghost" size="sm" onClick={handleClose} className="text-gray-400 hover:text-white">
    <XCircle className="h-5 w-5" />
  </Button>
        <ScrollArea className="flex-1 p-6">
          {/* Étape 1: Sélection des images */}
          {step === 'select' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">1. Sélectionnez les images à assembler</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedImages.length} image(s) sélectionnée(s)
                  </p>
                </div>
                <Button variant="outline" onClick={loadImages} size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Rafraîchir
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
                {images.length === 0 ? (
                  <div className="col-span-4 text-center py-12 text-muted-foreground">
                    <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Aucune image disponible</p>
                    <Button variant="link" onClick={loadImages} className="mt-2">
                      Charger les images
                    </Button>
                  </div>
                ) : (
                  images.map((image) => (
                    <Card
                      key={image.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedImages.includes(image.id) 
                          ? 'ring-2 ring-primary bg-primary/5' 
                          : ''
                      }`}
                      onClick={() => toggleImageSelection(image.id)}
                    >
                      <div className="aspect-video relative bg-muted rounded-t-lg overflow-hidden">
                        {image.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image.thumbnail}
                            alt={image.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Image className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        {selectedImages.includes(image.id) && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle className="h-5 w-5 text-primary bg-background rounded-full" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-2">
                        <p className="text-xs truncate">{image.filename}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {selectedImages.length >= 2 && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={reset}>
                    Réinitialiser
                  </Button>
                  <Button onClick={() => setStep('configure')}>
                    Suivant
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Étape 2: Configuration */}
          {step === 'configure' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-4">2. Configuration de l'assemblage</h3>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Configuration grille */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Configuration de la grille</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="autoDetect"
                        checked={autoDetectGrid}
                        onChange={(e) => setAutoDetectGrid(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor="autoDetect">
                        Détection automatique (recommandé)
                      </Label>
                    </div>

                    {!autoDetectGrid && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Lignes</Label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={gridRows}
                            onChange={(e) => setGridRows(parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div>
                          <Label>Colonnes</Label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={gridCols}
                            onChange={(e) => setGridCols(parseInt(e.target.value) || 1)}
                          />
                        </div>
                      </div>
                    )}

                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={detectGridAuto}
                      className="w-full"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Optimiser automatiquement
                    </Button>

                    {selectedImages.length >= 2 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={detectOverlap}
                        className="w-full"
                      >
                        <ZoomIn className="h-4 w-4 mr-2" />
                        Détecter les chevauchements
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Métadonnées */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Métadonnées</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Nom de l'image assemblée</Label>
                      <Input
                        placeholder="Mon_image_assemblee"
                        value={assemblyName}
                        onChange={(e) => setAssemblyName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Description de l'image globale..."
                        value={assemblyDescription}
                        onChange={(e) => setAssemblyDescription(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label>Dossier de destination</Label>
                      <select 
                        value={targetFolder}
                        onChange={(e) => setTargetFolder(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl h-10 px-4 text-xs text-white outline-none focus:border-purple-500/50 mt-1"
                      >
                        <option value="root">📁 Racine vision</option>
                        {flattenFolders(targetFolders).map((node) => (
                          <option key={node.id} value={node.id}>
                            {'\u00A0'.repeat(node.level * 4)}
                            {node.level > 0 ? '└─ ' : ''}
                            {node.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Tags</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          placeholder="Nouveau tag"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addTag()}
                        />
                        <Button type="button" variant="outline" onClick={addTag}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="gap-1">
                            {tag}
                            <button onClick={() => removeTag(tag)} className="ml-1">
                              <XCircle className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Visualisation de la grille */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Aperçu</CardTitle>
                </CardHeader>
                <CardContent>
                  <div 
                    className="grid gap-1 bg-black/40 p-4 rounded-xl border border-white/5"
                    style={{
                      gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`
                    }}
                  >
                    {selectedImages.slice(0, 25).map((id, idx) => {
                      const image = images.find(i => i.id === id);
                      return (
                        <div key={id} className="aspect-square bg-muted rounded overflow-hidden border border-white/10 relative group">
                          {image?.thumbnail ? (
                            <img
                              src={image.thumbnail}
                              alt={image.filename}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-muted-foreground">
                              {idx + 1}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <span className="text-[8px] font-bold text-white bg-black/60 px-1 rounded">{idx + 1}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {selectedImages.length} images à assembler
                  </p>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep('select')}>
                  Retour
                </Button>
                <Button onClick={startAssembly} disabled={isAssembling}>
                  {isAssembling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Assemblage...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Assembler
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Étape 3: Assemblage en cours */}
          {step === 'assemble' && (
            <div className="space-y-6 py-12">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <h3 className="mt-4 text-lg font-semibold">Assemblage en cours...</h3>
                <p className="text-muted-foreground">
                  L'IA assemble vos images, veuillez patienter
                </p>
              </div>
              <div className="max-w-md mx-auto">
                <Progress value={progress} className="h-2" />
                <p className="text-center text-sm text-muted-foreground mt-2">
                  {progress}%
                </p>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Étape 4: Résultat */}
          {step === 'complete' && result && (
            <div className="space-y-6">
              <div className="text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <h3 className="mt-2 text-lg font-semibold">Assemblage terminé !</h3>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Image résultat */}
                <Card>
                  <CardContent className="p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={result.url}
                      alt="Assemblage"
                      className="w-full rounded-lg"
                    />
                    <div className="mt-2 text-sm text-muted-foreground">
                      <p>Qualité: {Math.round(result.quality * 100)}%</p>
                      {result.width && result.height && (
                        <p>Dimensions: {result.width} x {result.height}px</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Image assemblée</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p><strong>ID:</strong> {result.id}</p>
                      <p><strong>Images sources:</strong> {selectedImages.length}</p>
                    </CardContent>
                    <CardFooter className="flex gap-2">
                      <Button className="flex-1" onClick={() => {
                        onOpenChange(false);
                        if (onAssemblyComplete) onAssemblyComplete(result);
                      }}>
                        <Save className="h-4 w-4 mr-2" />
                        Terminer
                      </Button>
                      <Button variant="outline" onClick={reset}>
                        Nouvel assemblage
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Indexation auto */}
                  <Alert>
                    <AlertDescription>
                      ✅ L'image assemblée a été automatiquement indexée et est prête pour
                      la recherche par similarité et le matching de pièces.
                    </AlertDescription>
                  </Alert>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}