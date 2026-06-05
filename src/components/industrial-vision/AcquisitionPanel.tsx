//src/components/industrial-vision/AcquisitionPanel.tsx// src/components/industrial-vision/AcquisitionPanel.tsx

'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Camera,
  Upload,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  RefreshCw,
  Video,
  X
} from 'lucide-react';

interface AcquisitionResult {
  success: boolean;
  imagePath?: string;
  filename?: string;
  error?: string;
  analysis?: any;
}

interface AcquisitionPanelProps {
  onImageAcquired?: (result: AcquisitionResult) => void;
  autoAnalyze?: boolean;
}

export function AcquisitionPanel({ onImageAcquired }: AcquisitionPanelProps) {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AcquisitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Références pour la capture caméra
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Upload d'image
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Veuillez sélectionner une image valide (JPG, PNG)');
        return;
      }
      
      setSelectedFile(file);
      setError(null);
      setResult(null);
      
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    
    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('type', 'capture');
    
    // Simuler progression
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 200);
    
    try {
      const response = await fetch('/api/industrial-vision/analyze', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      clearInterval(progressInterval);
      setProgress(100);
      
      if (response.ok) {
        const acquisitionResult: AcquisitionResult = {
          success: true,
          imagePath: data.path,
          filename: data.image,
          analysis: data
        };
        setResult(acquisitionResult);
        onImageAcquired?.(acquisitionResult);
      } else {
        throw new Error(data.error || 'Erreur lors de l\'analyse');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      setResult({ success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' });
    } finally {
      clearInterval(progressInterval);
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  // Capture caméra
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err) {
      setError('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
      console.error(err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setPreview(imageDataUrl);
    
    // Convertir en fichier
    const blob = await fetch(imageDataUrl).then(res => res.blob());
    const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
    setSelectedFile(file);
    
    stopCamera();
    setActiveTab('upload');
  };

  // Scan depuis le folder
  const [folderImages, setFolderImages] = useState<Array<{ name: string; path: string; preview: string }>>([]);
  const [isScanning, setIsScanning] = useState(false);

  const scanFolder = async () => {
    setIsScanning(true);
    setError(null);
    
    try {
      const response = await fetch('/api/industrial-vision/tree?type=captures&format=simple');
      const data = await response.json();
      
      if (data.success && data.paths) {
        const images = await Promise.all(
          data.paths.slice(0, 12).map(async (path: string) => {
            const filename = path.split('/').pop() || 'image';
            return {
              name: filename,
              path: path,
              preview: `/api/documents/raw?path=${encodeURIComponent(path)}`
            };
          })
        );
        setFolderImages(images);
      }
    } catch (err) {
      setError('Erreur lors du scan du dossier');
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  const selectFromFolder = async (imagePath: string) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/industrial-vision/analyze?path=${encodeURIComponent(imagePath)}`);
      const data = await response.json();
      
      if (response.ok) {
        const acquisitionResult: AcquisitionResult = {
          success: true,
          imagePath: imagePath,
          filename: imagePath.split('/').pop(),
          analysis: data
        };
        setResult(acquisitionResult);
        onImageAcquired?.(acquisitionResult);
      } else {
        throw new Error(data.error || 'Erreur lors de l\'analyse');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setProgress(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-cyan-500" />
          Acquisition d'image
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="upload">
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="camera">
              <Camera className="h-3.5 w-3.5 mr-1" />
              Caméra
            </TabsTrigger>
            <TabsTrigger value="folder">
              <FolderOpen className="h-3.5 w-3.5 mr-1" />
              Dossier
            </TabsTrigger>
          </TabsList>

          {/* Tab Upload */}
          <TabsContent value="upload">
            <div className="space-y-4">
              {/* Zone de preview/upload */}
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                {preview ? (
                  <div className="space-y-4">
                    <img 
                      src={preview} 
                      alt="Preview" 
                      className="max-h-64 mx-auto rounded-lg object-contain"
                    />
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" size="sm" onClick={resetForm}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Effacer
                      </Button>
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="image-upload"
                      />
                      <Button asChild variant="outline" size="sm">
                        <label htmlFor="image-upload" className="cursor-pointer">
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Changer
                        </label>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="h-12 w-12 mx-auto text-gray-400" />
                    <p className="text-sm text-gray-500">
                      Glissez-déposez une image ou cliquez pour parcourir
                    </p>
                    <p className="text-xs text-gray-400">
                      Formats supportés: JPG, PNG (max 10MB)
                    </p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="image-upload-main"
                    />
                    <Button asChild variant="outline">
                      <label htmlFor="image-upload-main" className="cursor-pointer">
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Parcourir
                      </label>
                    </Button>
                  </div>
                )}
              </div>

              {/* Progression */}
              {isProcessing && progress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Analyse en cours...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1" />
                </div>
              )}

              {/* Erreur */}
              {error && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  {error}
                </div>
              )}

              {/* Succès */}
              {result?.success && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">Image acquise avec succès</span>
                  </div>
                  {result.filename && (
                    <p className="text-xs text-green-500 mt-1">{result.filename}</p>
                  )}
                </div>
              )}

              {/* Bouton d'analyse */}
              {selectedFile && !result && (
                <Button 
                  onClick={handleUpload} 
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      Analyser l'image (40 innovations)
                    </>
                  )}
                </Button>
              )}
            </div>
          </TabsContent>

          {/* Tab Caméra */}
          <TabsContent value="camera">
            <div className="space-y-4">
              {!isCameraActive ? (
                <div className="text-center space-y-4">
                  <Video className="h-16 w-16 mx-auto text-gray-400" />
                  <p className="text-sm text-gray-500">
                    Utilisez votre caméra pour capturer une image
                  </p>
                  <Button onClick={startCamera}>
                    <Camera className="h-4 w-4 mr-2" />
                    Activer la caméra
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full max-h-96 object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={stopCamera} className="flex-1">
                      <X className="h-4 w-4 mr-2" />
                      Annuler
                    </Button>
                    <Button onClick={captureImage} className="flex-1">
                      <Camera className="h-4 w-4 mr-2" />
                      Capturer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab Dossier */}
          <TabsContent value="folder">
            <div className="space-y-4">
              <Button 
                variant="outline" 
                onClick={scanFolder} 
                disabled={isScanning}
                className="w-full"
              >
                {isScanning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Scanner le dossier des captures
              </Button>

              {folderImages.length > 0 && (
                <div className="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                  {folderImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="cursor-pointer group relative"
                      onClick={() => selectFromFolder(img.path)}
                    >
                      <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                        <img
                          src={img.preview}
                          alt={img.name}
                          className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder-image.png';
                          }}
                        />
                      </div>
                      <p className="text-xs truncate mt-1 text-center">{img.name}</p>
                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {folderImages.length === 0 && !isScanning && (
                <div className="text-center py-8 text-gray-500">
                  <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aucune image dans le dossier des captures</p>
                  <p className="text-xs mt-1">Utilisez l'onglet Upload pour ajouter des images</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Résumé de l'acquisition */}
        {result?.analysis && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Résumé de l'analyse</h4>
            <div className="space-y-1 text-sm">
              {result.analysis.similarity && (
                <div className="flex justify-between">
                  <span className="text-gray-500">État détecté:</span>
                  <Badge variant="outline">
                    {result.analysis.similarity.bestMatch === 'marche_normale' ? 'Marche normale' :
                     result.analysis.similarity.bestMatch === 'arret_normale' ? 'Arrêt normal' : 'Défaut'}
                  </Badge>
                </div>
              )}
              {result.analysis.diagnostic && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Diagnostic:</span>
                  <span className="text-right">{result.analysis.diagnostic}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}