'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  Search, 
  FolderTree, 
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  Eye,
  Trash2,
  Edit2,
  Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { OCRService } from '@/lib/ocr/ocr-service';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

// ============================================
// TYPES
// ============================================

interface VisionFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

interface VisionImage {
  id: string;
  filename: string;
  thumbnailUrl: string;
  url: string;
  description?: string;
  tags?: string[];
  location?: string;  // 🔥 AJOUTÉ
  similarity?: number;
  folderId?: string;
  createdAt: string;
}

interface SearchResult {
  found: boolean;
  match?: {
    id: string;
    similarity: number;
    metadata: any;
  };
  matches: Array<{
    id: string;
    similarity: number;
    metadata: any;
  }>;
  data?: VisionImage;
  message: string;
}

// ============================================
// COMPOSANT ARBRE DES DOSSIERS
// ============================================

const FolderTreeView = ({ 
  folders, 
  selectedFolderId, 
  onSelectFolder,
  onAddFolder,
  onDeleteFolder
}: { 
  folders: VisionFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onAddFolder: (parentId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const [newFolderName, setNewFolderName] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);

  const buildTree = (parentId: string | null = null): VisionFolder[] => {
    return folders.filter(f => f.parentId === parentId);
  };

  const toggleExpand = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (expandedFolders.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleAddFolder = () => {
    if (newFolderName.trim()) {
      onAddFolder(addParentId);
      setNewFolderName('');
      setShowAddInput(false);
    }
  };

  const renderFolder = (folder: VisionFolder, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const children = buildTree(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id} style={{ marginLeft: level * 16 }}>
        <div 
          className={`flex items-center justify-between py-1 px-2 rounded-md cursor-pointer hover:bg-gray-700 group ${isSelected ? 'bg-blue-600/20 border-l-2 border-blue-500' : ''}`}
          onClick={() => onSelectFolder(folder.id)}
        >
          <div className="flex items-center gap-1">
            {children.length > 0 && (
              <button 
                onClick={(e) => { e.stopPropagation(); toggleExpand(folder.id); }}
                className="p-0.5"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
            {children.length === 0 && <div className="w-4" />}
            <FolderTree size={14} className="text-yellow-500" />
            <span className="text-sm">{folder.name}</span>
            <Badge variant="outline" className="text-[10px] ml-1">
              {children.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button 
              onClick={(e) => { e.stopPropagation(); setAddParentId(folder.id); setShowAddInput(true); }}
              className="p-0.5 hover:bg-gray-600 rounded"
            >
              +
            </button>
            {folder.id !== 'root' && (
              <button 
                onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }}
                className="p-0.5 hover:bg-red-600 rounded"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
        {isExpanded && children.map(child => renderFolder(child, level + 1))}
      </div>
    );
  };

  const rootFolders = buildTree(null);

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2 px-2">
        <span className="text-xs font-semibold text-gray-400">📁 ARBORESCENCE</span>
        <button 
          onClick={() => { setAddParentId(null); setShowAddInput(true); }}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          + Nouveau dossier
        </button>
      </div>
      
      {showAddInput && (
        <div className="mb-2 px-2 flex gap-1">
          <Input 
            placeholder="Nom du dossier"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddFolder();
              if (e.key === 'Escape') setShowAddInput(false);
            }}
          />
          <Button 
            size="sm" 
            className="h-7 px-2 text-xs"
            onClick={handleAddFolder}
          >
            OK
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 px-2 text-xs"
            onClick={() => {
              setShowAddInput(false);
              setNewFolderName('');
            }}
          >
            ✕
          </Button>
        </div>
      )}
      
      <div className="space-y-0.5">
        {rootFolders.map(folder => renderFolder(folder))}
      </div>
      
      <div className="mt-4 pt-2 border-t border-gray-700">
        <button 
          onClick={() => onSelectFolder(null)}
          className={`w-full text-left px-2 py-1 text-sm rounded-md transition ${selectedFolderId === null ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-700'}`}
        >
          📂 Toutes les images
        </button>
      </div>
    </div>
  );
};

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export default function BanqueImagesPage() {
  const [folders, setFolders] = useState<VisionFolder[]>([]);
  const [images, setImages] = useState<VisionImage[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<VisionImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    tags: '',
    location: '',
    equipmentState: ''
  });
  const [ocrText, setOcrText] = useState<string>('');
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ============================================
  // CHARGEMENT DES DONNÉES
  // ============================================
  
  const loadFolders = async () => {
    try {
      const res = await fetch('/api/vision/folders');
      const data = await res.json();
      setFolders(data);
    } catch (error) {
      console.error('Erreur chargement dossiers:', error);
    }
  };

  const loadImages = async (folderId?: string | null) => {
    setIsLoading(true);
    try {
      const url = folderId 
        ? `/api/vision/images?folderId=${folderId}&limit=100`
        : '/api/vision/images?limit=100';
      const res = await fetch(url);
      const data = await res.json();
      setImages(data.images || []);
    } catch (error) {
      console.error('Erreur chargement images:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFolders();
    loadImages();
  }, []);

  useEffect(() => {
    loadImages(selectedFolderId);
  }, [selectedFolderId]);

  // ============================================
  // GESTION DES DOSSIERS
  // ============================================
  
  const handleAddFolder = async (parentId: string | null) => {
    console.log('Ajouter dossier à', parentId);
    await loadFolders();
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (confirm('Supprimer ce dossier et son contenu ?')) {
      await fetch(`/api/vision/folders/${folderId}`, { method: 'DELETE' });
      await loadFolders();
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
        loadImages(null);
      }
    }
  };

  // ============================================
  // ACQUISITION D'IMAGE
  // ============================================
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCapturedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setCapturedImage(imageData);
      runOCR(imageData);
    };
    reader.readAsDataURL(file);
    setShowCamera(false);
  };


  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Erreur accès caméra:', error);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const imageData = canvasRef.current.toDataURL('image/jpeg');
      setCapturedImage(imageData);
      
      fetch(imageData)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
          setCapturedFile(file);
        });
      
      const stream = videoRef.current.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      setShowCamera(false);
      
      // Lancer l'OCR après la capture
      runOCR(imageData);
    }
  };


  const cancelCapture = () => {
    setCapturedImage(null);
    setCapturedFile(null);
    setSearchResult(null);
    setSelectedImage(null);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
    setOcrText('');
  };

  const runOCR = async (imageSource: string | File) => {
    setIsOcrProcessing(true);
    try {
      console.log('🚀 Lancement OCR...');
      const result = await OCRService.recognize(imageSource);
      console.log('✅ OCR Terminé:', result.text);
      setOcrText(result.text);
      // Pré-remplir la description si elle est vide
      if (!editForm.description) {
        setEditForm(prev => ({ ...prev, description: result.text.substring(0, 500) }));
      }
    } catch (error) {
      console.error('❌ Erreur OCR:', error);
    } finally {
      setIsOcrProcessing(false);
    }
  };


  // ============================================
  // RECHERCHE PAR SIMILARITÉ
  // ============================================
  
  const searchSimilarImage = async () => {
    if (!capturedFile) return;
    
    setIsLoading(true);
    const formData = new FormData();
    formData.append('image', capturedFile);
    formData.append('threshold', '0.7');
    
    try {
      const res = await fetch('/api/vision/search', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      setSearchResult(result);
      
      if (result.found && result.data) {
        setSelectedImage(result.data);
      }
    } catch (error) {
      console.error('Erreur recherche:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // ENREGISTREMENT D'IMAGE
  // ============================================
  
  const registerImage = async () => {
    if (!capturedFile) return;
    
    setIsLoading(true);
    const formData = new FormData();
    formData.append('image', capturedFile);
    formData.append('filename', capturedFile.name);
    formData.append('folderId', selectedFolderId || 'root');
    formData.append('description', editForm.description);
    formData.append('tags', editForm.tags);
    formData.append('location', editForm.location);
    formData.append('equipmentState', editForm.equipmentState);
    formData.append('ocrText', ocrText);

    
    try {
      const res = await fetch('/api/vision/register', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      if (result.success) {
        alert('✅ Image enregistrée avec succès !');
        cancelCapture();
        loadImages(selectedFolderId);
      }
    } catch (error) {
      console.error('Erreur enregistrement:', error);
      alert('❌ Erreur lors de l\'enregistrement');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // SUPPRESSION D'IMAGE
  // ============================================
  
  const deleteImage = async (imageId: string) => {
    if (confirm('Supprimer cette image définitivement ?')) {
      await fetch(`/api/vision/images/${imageId}`, { method: 'DELETE' });
      loadImages(selectedFolderId);
      if (selectedImage?.id === imageId) setSelectedImage(null);
    }
  };

  // ============================================
  // MISE À JOUR DES MÉTADONNÉES
  // ============================================
  
  const updateImageMetadata = async (imageId: string) => {
    await fetch(`/api/vision/images/${imageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: editForm.description,
        tags: editForm.tags.split(',').map(t => t.trim()),
        location: editForm.location,
        equipmentState: editForm.equipmentState
      })
    });
    setEditingImage(null);
    loadImages(selectedFolderId);
  };

  // ============================================
  // RENDU
  // ============================================
  
  return (
    <div className="flex h-screen bg-[#1a1a1a] text-white">
      {/* ============================================================ */}
      {/* SIDEBAR GAUCHE - Arborescence */}
      {/* ============================================================ */}
      <div className="w-64 border-r border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <h2 className="text-sm font-bold text-purple-400">📁 BANQUE D&apos;IMAGES IA</h2>
          <p className="text-[10px] text-gray-500">Référentiel vectoriel multimodal</p>
        </div>
        
        <ScrollArea className="flex-1">
          <FolderTreeView 
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => setSelectedFolderId(id)}
            onAddFolder={handleAddFolder}
            onDeleteFolder={handleDeleteFolder}
          />
        </ScrollArea>
        
        <div className="p-3 border-t border-gray-800 text-[10px] text-gray-600">
          <p>Pipeline actif: RIAC Hybride</p>
          <p>Surveillance en temps réel</p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CONTENU PRINCIPAL */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col">
        
        {/* Header */}
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Banque d&apos;images IA</h1>
            <p className="text-xs text-gray-400">
              {selectedFolderId 
                ? `Dossier: ${folders.find(f => f.id === selectedFolderId)?.name || '...'}`
                : 'Toutes les images'}
              {' · '}{images.length} image(s)
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={startCamera}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded-lg text-sm hover:bg-blue-500 transition"
            >
              <Camera size={16} /> Prendre une photo
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 rounded-lg text-sm hover:bg-purple-500 transition"
            >
              <Upload size={16} /> Choisir un fichier
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
        </div>

        {/* Zone d'acquisition / recherche */}
        {capturedImage && (
          <div className="p-4 border-b border-gray-800 bg-gray-900/50">
            <div className="flex gap-6">
              {/* Aperçu de l'image capturée */}
              <div className="w-48 h-48 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                <img src={capturedImage} alt="Capture" className="w-full h-full object-cover" />
              </div>
              
              {/* Résultats de recherche */}
              <div className="flex-1">
                {!searchResult ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-gray-400">Image capturée. Rechercher des similitudes ?</p>
                    <div className="flex gap-2">
                      <Button onClick={searchSimilarImage} disabled={isLoading}>
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search size={16} />}
                        Rechercher
                      </Button>
                      <Button variant="outline" onClick={cancelCapture}>Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      {searchResult.found ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          <span className="text-green-400">Image trouvée !</span>
                          <Badge>{Math.round((searchResult.match?.similarity || 0) * 100)}% similarité</Badge>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-5 h-5 text-yellow-500" />
                          <span className="text-yellow-400">Aucune image similaire trouvée</span>
                        </>
                      )}
                    </div>
                    
                    {searchResult.found && searchResult.data && (
                      <div className="bg-gray-800 rounded-lg p-3 mb-3">
                        <div className="flex gap-3">
                          <img 
                            src={searchResult.data.thumbnailUrl} 
                            alt={searchResult.data.filename}
                            className="w-16 h-16 object-cover rounded"
                          />
                          <div>
                            <p className="font-medium">{searchResult.data.filename}</p>
                            <p className="text-xs text-gray-400">{searchResult.data.description || 'Pas de description'}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {searchResult.data.tags?.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex flex-col gap-2">
                      {isOcrProcessing && (
                        <div className="flex items-center gap-2 text-xs text-blue-400">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Extraction du texte en cours...
                        </div>
                      )}
                      {!isOcrProcessing && ocrText && (
                        <div className="text-[10px] bg-blue-900/30 p-2 rounded border border-blue-800/50 max-h-24 overflow-y-auto">
                          <p className="font-bold mb-1 text-blue-300">Texte extrait :</p>
                          <p className="text-gray-300 whitespace-pre-wrap">{ocrText}</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {!searchResult.found && (
                          <Button onClick={registerImage} className="bg-green-600 hover:bg-green-500" disabled={isOcrProcessing}>
                            <Save size={16} /> Enregistrer l'image
                          </Button>
                        )}
                        <Button variant="outline" onClick={cancelCapture}>Nouvelle recherche</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* Caméra */}
        {showCamera && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
            <div className="bg-gray-900 rounded-xl p-4">
              <video ref={videoRef} autoPlay playsInline className="rounded-lg max-w-2xl" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex justify-center gap-3 mt-4">
                <Button onClick={capturePhoto}>📸 Capturer</Button>
                <Button variant="outline" onClick={cancelCapture}>Annuler</Button>
              </div>
            </div>
          </div>
        )}

        {/* Grille d'images */}
        <ScrollArea className="flex-1 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <ImageIcon size={48} className="mb-4 opacity-30" />
              <p>Aucune image dans ce dossier</p>
              <p className="text-sm">Utilisez le bouton ci-dessus pour ajouter des images</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {images.map(img => (
                <Card 
                  key={img.id} 
                  className={`cursor-pointer transition-all hover:scale-105 ${selectedImage?.id === img.id ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => setSelectedImage(img)}
                >
                  <CardContent className="p-0">
                    <img 
                      src={img.thumbnailUrl} 
                      alt={img.filename}
                      className="w-full h-32 object-cover rounded-t-lg"
                    />
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{img.filename}</p>
                      {img.similarity && (
                        <Badge variant="outline" className="text-[9px] mt-1">
                          {Math.round(img.similarity * 100)}% match
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ============================================================ */}
      {/* SIDEBAR DROIT - Métadonnées de l'image sélectionnée */}
      {/* ============================================================ */}
      <div className="w-80 border-l border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold">🔍 MÉTADONNÉES</h3>
        </div>
        
        <ScrollArea className="flex-1 p-3">
          {selectedImage ? (
            <div className="space-y-4">
              <img 
                src={selectedImage.url} 
                alt={selectedImage.filename}
                className="w-full rounded-lg"
              />
              
              {editingImage === selectedImage.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400">Description</label>
                    <Textarea 
                      value={editForm.description}
                      onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      className="mt-1 text-sm"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Tags (séparés par des virgules)</label>
                    <Input 
                      value={editForm.tags}
                      onChange={(e) => setEditForm(prev => ({ ...prev, tags: e.target.value }))}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Localisation</label>
                    <Input 
                      value={editForm.location}
                      onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateImageMetadata(selectedImage.id)}>
                      <Save size={14} /> Enregistrer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingImage(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-gray-400">Fichier</p>
                    <p className="text-sm font-mono break-all">{selectedImage.filename}</p>
                  </div>
                  {selectedImage.description && (
                    <div>
                      <p className="text-xs text-gray-400">Description</p>
                      <p className="text-sm">{selectedImage.description}</p>
                    </div>
                  )}
                  {selectedImage.tags && selectedImage.tags.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400">Tags</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedImage.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedImage.location && (
                    <div>
                      <p className="text-xs text-gray-400">Localisation</p>
                      <p className="text-sm">{selectedImage.location}</p>
                    </div>
                  )}
                  <div className="pt-3 border-t border-gray-800 flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setEditingImage(selectedImage.id);
                        setEditForm({
                          description: selectedImage.description || '',
                          tags: selectedImage.tags?.join(', ') || '',
                          location: selectedImage.location || '',
                          equipmentState: ''
                        });
                      }}
                    >
                      <Edit2 size={14} /> Modifier
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => deleteImage(selectedImage.id)}
                    >
                      <Trash2 size={14} /> Supprimer
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Eye size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sélectionnez une image</p>
              <p className="text-xs">pour voir ses métadonnées</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}