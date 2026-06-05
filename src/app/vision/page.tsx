// app/vision/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { navigateBack } from '@/lib/navigation';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Search, 
  Camera, 
  Upload, 
  X,
  Loader2,
  Sparkles,
  FileText,
  Filter,
  Target
} from 'lucide-react';
import CameraCapture from '@/components/vision/CameraCapture';
import VisionResults, { MetadataDisplay } from '@/components/vision/VisionResults';
import EnhancedVisionConfirmDialog from '@/components/vision/EnhancedVisionConfirmDialog';
import { Card, CardContent } from '@/components/ui/card';
import { useVisionSearch } from '@/hooks/useVisionSearch';
import { usePartMatching, GlobalImage } from '@/hooks/usePartMatching';

// Types pour les filtres
interface SearchFilters {
  folderId?: string;
  tags?: string[];
  minConfidence?: number;
  globalImageId?: string;
}

export default function VisionPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'menu' | 'camera' | 'upload' | 'results' | 'metadata'>('menu');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [suggestedMetadata, setSuggestedMetadata] = useState<any>(null);
  const [confirmedMetadata, setConfirmedMetadata] = useState<any>(null);
  
  // États pour la recherche
  const [searchMode, setSearchMode] = useState<'vision' | 'text' | 'hybrid' | 'part'>('vision');
  const [textQuery, setTextQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [globalImages, setGlobalImages] = useState<GlobalImage[]>([]);
  const [isLoadingGlobals, setIsLoadingGlobals] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    searchImage,
    searchByText,
    searchHybrid,
    searchPartLocation,  // 🔥 NOUVEAU
    registerImage,
    getSuggestions,
    isLoading,
    result,
    reset
  } = useVisionSearch();

  const {
    listGlobalImages
  } = usePartMatching();

  // Charger les dossiers disponibles pour les filtres
  useEffect(() => {
    const loadFolders = async () => {
      try {
        const response = await fetch('/api/vision/folders');
        if (response.ok) {
          const data = await response.json();
          setAvailableFolders(data);
        }
      } catch (error) {
        console.error('Erreur chargement dossiers:', error);
      }
    };
    loadFolders();
  }, []);

  // Charger les images globales pour le mode Part Matching
  useEffect(() => {
    const loadGlobalImages = async () => {
      setIsLoadingGlobals(true);
      try {
        const globals = await listGlobalImages();
        setGlobalImages(globals);
      } catch (error) {
        console.error('Erreur chargement images globales:', error);
      } finally {
        setIsLoadingGlobals(false);
      }
    };
    loadGlobalImages();
  }, [listGlobalImages]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getUserImageSrc = (): string => {
    if (capturedImage) return capturedImage;
    if (previewUrl) return previewUrl;
    return '';
  };

  const base64ToFile = (base64: string, filename: string = 'capture.jpg'): File => {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  };

  // Recherche selon le mode sélectionné
  const performSearch = async () => {
    if (searchMode === 'part' && capturedFile) {
      // 🔥 Mode Part Matching (localisation dans pupitre)
      await searchPartLocation(capturedFile, {
        globalImageId: filters.globalImageId,
        threshold: filters.minConfidence || 0.7
      });
      setMode('results');
    } else if (searchMode === 'text' && textQuery.trim()) {
      await searchByText(textQuery, {
        threshold: filters.minConfidence || 0.7,
        filterFolder: filters.folderId,
        filterTags: filters.tags
      });
      setMode('results');
    } else if (searchMode === 'hybrid' && capturedFile && textQuery.trim()) {
      await searchHybrid(capturedFile, textQuery, {
        threshold: filters.minConfidence || 0.7,
        filterFolder: filters.folderId,
        filterTags: filters.tags,
        visionWeight: 0.6,
        textWeight: 0.4
      });
      setMode('results');
    } else if (capturedFile) {
      await searchImage(capturedFile, filters.minConfidence || 0.7);
      setMode('results');
    }
  };

  const handleCapture = async (imageSrc: string, textQueryFromCamera?: string) => {
    setCapturedImage(imageSrc);
    const file = base64ToFile(imageSrc);
    setCapturedFile(file);
    
    if (textQueryFromCamera) {
      setTextQuery(textQueryFromCamera);
    }
    
    if (searchMode === 'part') {
      // En mode Part Matching, on attend que l'utilisateur clique sur rechercher
      return;
    } else if (searchMode === 'hybrid' && (textQueryFromCamera || textQuery.trim())) {
      const query = textQueryFromCamera || textQuery;
      await searchHybrid(file, query, {
        threshold: filters.minConfidence || 0.7,
        filterFolder: filters.folderId,
        filterTags: filters.tags
      });
      setMode('results');
    } else {
      await searchImage(file, filters.minConfidence || 0.7);
      setMode('results');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image valide');
      return;
    }
    setSelectedFile(file);
    setCapturedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setMode('upload');
  };

  const processUploadedFile = async () => {
    if (!selectedFile) return;
    await performSearch();
  };

  const cancelUpload = () => {
    setSelectedFile(null);
    setCapturedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setMode('menu');
  };

  const handleConfirm = () => {
    if (result?.data) {
      setConfirmedMetadata(result.data);
      setMode('metadata');
    }
  };

  const handleOpenRegister = async () => {
    if (capturedFile) {
      try {
        const suggestions = await getSuggestions(capturedFile);
        setSuggestedMetadata(suggestions);
      } catch (e) {}
    }
    setShowConfirmDialog(true);
  };

  const handleRegister = async (metadata: any) => {
    const fileToRegister = capturedFile || selectedFile;
    if (!fileToRegister) return;
    
    await registerImage(fileToRegister, metadata);
    setShowConfirmDialog(false);
    alert('✅ Image enregistrée avec succès !');
    handleReset();
  };

  const handleRegisterLater = () => {
    if (capturedFile) {
      try {
        const pendingImages = JSON.parse(localStorage.getItem('pending_vision_images') || '[]');
        pendingImages.push({
          name: capturedFile.name,
          size: capturedFile.size,
          type: capturedFile.type,
          timestamp: new Date().toISOString(),
        });
        localStorage.setItem('pending_vision_images', JSON.stringify(pendingImages));
        alert('✅ Image mise en attente pour enregistrement ultérieur');
      } catch (e) {
        console.error('Erreur stockage:', e);
      }
    }
    handleReset();
  };

  const handleRetry = () => {
    handleReset();
  };

  const handleReset = () => {
    setCapturedImage(null);
    setCapturedFile(null);
    setSelectedFile(null);
    setConfirmedMetadata(null);
    setTextQuery('');
    setSearchMode('vision');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setMode('menu');
    reset();
  };

  const handleCloseMetadata = () => {
    handleReset();
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#212121] text-white">
      <header className="bg-[#2a2a2a] border-b border-gray-700 p-4">
        <div className="container mx-auto flex items-center gap-4 flex-wrap">
          <Button 
            onClick={() => {
              if (mode !== 'menu') {
                handleReset();
              } else {
                navigateBack(router, '/');
              }
            }} 
            variant="ghost" 
            size="icon"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Diagnostic Vision IA Expert</h1>
          <Badge className="ml-auto bg-purple-600/20 text-purple-400">
            <Sparkles className="w-3 h-3 mr-1" />IA Locale
          </Badge>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          
          {/* ================================================================ */}
          {/* MENU PRINCIPAL AVEC MODES DE RECHERCHE */}
          {/* ================================================================ */}
          {mode === 'menu' && (
            <div className="space-y-8">
              {/* Sélecteur de mode de recherche */}
              <div className="bg-gray-800/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm text-gray-400">Mode de recherche</label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-1"
                  >
                    <Filter className="w-3 h-3" />
                    Filtres
                  </Button>
                </div>
                
                <Tabs value={searchMode} onValueChange={(v) => setSearchMode(v as any)} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="vision" className="gap-2">
                      <Camera className="w-4 h-4" />
                      Par image
                    </TabsTrigger>
                    <TabsTrigger value="text" className="gap-2">
                      <FileText className="w-4 h-4" />
                      Par texte
                    </TabsTrigger>
                    <TabsTrigger value="hybrid" className="gap-2">
                      <Sparkles className="w-4 h-4" />
                      Hybride
                    </TabsTrigger>
                    <TabsTrigger value="part" className="gap-2">
                      <Target className="w-4 h-4" />
                      Localiser
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Champ de recherche texte (pour mode text ou hybrid) */}
                {(searchMode === 'text' || searchMode === 'hybrid') && (
                  <div className="mt-4">
                    <Input
                      type="text"
                      placeholder={searchMode === 'hybrid' 
                        ? "Décrivez l'équipement recherché (ex: pompe rouge avec manomètre)" 
                        : "Recherche textuelle d'images..."}
                      value={textQuery}
                      onChange={(e) => setTextQuery(e.target.value)}
                      className="bg-gray-900 border-gray-700"
                    />
                  </div>
                )}

                {/* Sélecteur d'image globale pour mode Part Matching */}
                {searchMode === 'part' && (
                  <div className="mt-4">
                    <label className="text-sm text-gray-400 mb-2 block">Pupitre de référence (optionnel)</label>
                    <select
                      value={filters.globalImageId || ''}
                      onChange={(e) => setFilters({ ...filters, globalImageId: e.target.value || undefined })}
                      className="w-full bg-gray-900 border-gray-700 rounded-md p-2 text-sm"
                      disabled={isLoadingGlobals}
                    >
                      <option value="">Tous les pupitres</option>
                      {globalImages.map(img => (
                        <option key={img.id} value={img.imageId}>
                          {img.filename} ({img.patchesCount} patches)
                        </option>
                      ))}
                    </select>
                    {isLoadingGlobals && (
                      <p className="text-xs text-gray-500 mt-1">Chargement des pupitres...</p>
                    )}
                    {!isLoadingGlobals && globalImages.length === 0 && (
                      <p className="text-xs text-yellow-500 mt-1">
                        ⚠️ Aucun pupitre enregistré. Commencez par enregistrer une image globale.
                      </p>
                    )}
                  </div>
                )}

                {/* Filtres avancés */}
                {showFilters && (
                  <div className="mt-4 p-4 bg-gray-900/50 rounded-lg space-y-3">
                    <h4 className="text-sm font-medium text-gray-300">Filtres avancés</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <select
                        value={filters.folderId || ''}
                        onChange={(e) => setFilters({ ...filters, folderId: e.target.value || undefined })}
                        className="bg-gray-800 border-gray-700 rounded-md p-2 text-sm"
                      >
                        <option value="">Tous les dossiers</option>
                        {availableFolders.map(folder => (
                          <option key={folder.id} value={folder.id}>{folder.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Confiance min. (0-1)"
                        step="0.05"
                        min="0"
                        max="1"
                        value={filters.minConfidence || ''}
                        onChange={(e) => setFilters({ ...filters, minConfidence: parseFloat(e.target.value) || undefined })}
                        className="bg-gray-800 border-gray-700 rounded-md p-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Options d'acquisition d'image */}
              {(searchMode === 'vision' || searchMode === 'hybrid' || searchMode === 'part') && (
                <>
                  <h2 className="text-2xl font-bold text-center mt-6">
                    {searchMode === 'part' 
                      ? 'Prenez une photo du détail à localiser'
                      : 'Comment souhaitez-vous acquérir l\'image ?'}
                  </h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card className="bg-white/5 border-gray-700 hover:bg-white/10 cursor-pointer" onClick={() => setMode('camera')}>
                      <CardContent className="p-8 text-center">
                        <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                          <Camera className="w-10 h-10 text-blue-400" />
                        </div>
                        <h3 className="text-xl font-semibold">Prendre une photo</h3>
                        <p className="text-sm text-gray-400">
                          {searchMode === 'part' 
                            ? 'Photo d\'un détail (pompe, vanne, etc.)'
                            : 'Utilisez la caméra de votre appareil'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-white/5 border-gray-700 hover:bg-white/10 cursor-pointer" onClick={triggerFileInput}>
                      <CardContent className="p-8 text-center">
                        <div className="w-20 h-20 bg-purple-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                          <Upload className="w-10 h-10 text-purple-400" />
                        </div>
                        <h3 className="text-xl font-semibold">Choisir un fichier</h3>
                        <p className="text-sm text-gray-400">Sélectionnez une image</p>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}

              {/* Mode texte seul: bouton de recherche direct */}
              {searchMode === 'text' && (
                <div className="flex justify-center">
                  <Button 
                    onClick={() => performSearch()}
                    disabled={!textQuery.trim() || isLoading}
                    className="bg-purple-600 hover:bg-purple-700 px-8 py-6 text-lg"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
                    Rechercher
                  </Button>
                </div>
              )}

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </div>
          )}

          {/* ================================================================ */}
          {/* MODE CAMÉRA */}
          {/* ================================================================ */}
          {mode === 'camera' && (
            <CameraCapture 
              onCapture={handleCapture} 
              onCancel={() => setMode('menu')}
              captureMode={searchMode === 'hybrid' ? 'with-text' : 'standard'} 
            />
          )}

          {/* ================================================================ */}
          {/* MODE UPLOAD - PRÉVISUALISATION */}
          {/* ================================================================ */}
          {mode === 'upload' && previewUrl && selectedFile && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Prévisualisation</h2>
              
              {/* Champ texte pour recherche hybride */}
              {searchMode === 'hybrid' && (
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <label className="text-sm text-gray-400 mb-2 block">Description de l'équipement recherché</label>
                  <Input
                    type="text"
                    placeholder="Ex: pompe industrielle rouge avec manomètre..."
                    value={textQuery}
                    onChange={(e) => setTextQuery(e.target.value)}
                    className="bg-gray-900 border-gray-700"
                  />
                </div>
              )}
              
              {/* Sélecteur d'image globale pour mode Part Matching */}
              {searchMode === 'part' && (
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <label className="text-sm text-gray-400 mb-2 block">Pupitre de référence (optionnel)</label>
                  <select
                    value={filters.globalImageId || ''}
                    onChange={(e) => setFilters({ ...filters, globalImageId: e.target.value || undefined })}
                    className="w-full bg-gray-900 border-gray-700 rounded-md p-2 text-sm"
                    disabled={isLoadingGlobals}
                  >
                    <option value="">Tous les pupitres</option>
                    {globalImages.map(img => (
                      <option key={img.id} value={img.imageId}>
                        {img.filename} ({img.patchesCount} patches)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-white/5">
                  <CardContent className="p-4">
                    <img src={previewUrl} alt="Preview" className="w-full rounded-lg" />
                  </CardContent>
                </Card>
                <Card className="bg-white/5">
                  <CardContent className="p-6 space-y-4">
                    <p className="text-sm text-gray-400">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} Ko)</p>
                    <p className="text-xs text-purple-400">
                      Mode: {searchMode === 'part' ? '🎯 Localisation dans pupitre' : 
                             searchMode === 'hybrid' ? '🔀 Recherche hybride' : 
                             '🖼️ Recherche par image'}
                    </p>
                    <div className="flex gap-3">
                      <Button 
                        onClick={processUploadedFile} 
                        disabled={isLoading || (searchMode === 'hybrid' && !textQuery.trim())} 
                        className="flex-1 bg-purple-600"
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-2" />Rechercher</>}
                      </Button>
                      <Button onClick={cancelUpload} variant="outline"><X className="w-4 h-4 mr-2" />Annuler</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* MODE RÉSULTATS */}
          {/* ================================================================ */}
          {mode === 'results' && result && (
            <VisionResults
              result={result}
              userImageSrc={getUserImageSrc()}
              onConfirm={handleConfirm}
              onRegisterNow={handleOpenRegister}
              onRegisterLater={handleRegisterLater}
              onRetry={handleRetry}
              isProcessing={isLoading}
              searchQuery={textQuery || undefined}
              searchMode={searchMode}
            />
          )}

          {/* ================================================================ */}
          {/* MODE AFFICHAGE MÉTADONNÉES */}
          {/* ================================================================ */}
          {mode === 'metadata' && confirmedMetadata && (
            <MetadataDisplay 
              data={confirmedMetadata} 
              confidence={result?.confidence}
              onClose={handleCloseMetadata} 
            />
          )}

          {/* ================================================================ */}
          {/* LOADER */}
          {/* ================================================================ */}
          {isLoading && mode === 'results' && !result && (
            <div className="text-center p-12">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-400" />
              <p className="text-gray-400 mt-4">
                {searchMode === 'part' ? 'Recherche de localisation en cours...' :
                 searchMode === 'text' ? 'Recherche textuelle en cours...' :
                 searchMode === 'hybrid' ? 'Recherche hybride en cours...' :
                 'Recherche par similarité en cours...'}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Dialogue d'enregistrement */}
      <EnhancedVisionConfirmDialog
        open={showConfirmDialog}
        imageSrc={getUserImageSrc()}
        imageFile={capturedFile || selectedFile || undefined}
        suggestedMetadata={suggestedMetadata}
        initialFolderId={filters.folderId}
        onConfirm={handleRegister}
        onCancel={() => setShowConfirmDialog(false)}
        isProcessing={isLoading}
      />
    </div>
  );
}