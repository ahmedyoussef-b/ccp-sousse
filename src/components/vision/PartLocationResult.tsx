// src/components/vision/PartLocationResult.tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  Maximize2, 
  Minimize2,
  Camera,
  Target,
  MapPin
} from 'lucide-react';
import { useState } from 'react';
import { PartLocationResult as PartLocationResultType } from './shared/types/type';

interface PartLocationResultProps {
  result: PartLocationResultType;
  queryImageSrc: string;
  onRetry?: () => void;
  onRegisterGlobal?: () => void;
  isProcessing?: boolean;
}

export default function PartLocationResult({
  result,
  queryImageSrc,
  onRetry,
  onRegisterGlobal,
  isProcessing = false
}: PartLocationResultProps) {
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [selectedGlobalImage, setSelectedGlobalImage] = useState<string | null>(
    result.globalImage?.id || null
  );

  // Si aucune image globale sélectionnée et qu'il y a des résultats, prendre le premier
  if (!selectedGlobalImage && result.globalImage) {
    setSelectedGlobalImage(result.globalImage.id);
  }

  // ========================================================================
  // CAS 1 : LOCALISATION TROUVÉE
  // ========================================================================
  if (result.found && result.globalImage && result.matchedZone) {
    const { matchedZone, globalImage, similarity } = result;
    const confidencePercent = Math.round(similarity * 100);
    const isHighConfidence = similarity >= 0.75;
    const isMediumConfidence = similarity >= 0.55 && similarity < 0.75;

    return (
      <div className="space-y-6">
        {/* En-tête de succès */}
        <div className={`p-4 rounded-lg text-center ${
          isHighConfidence 
            ? 'bg-green-600/10 border border-green-500/30'
            : isMediumConfidence
            ? 'bg-yellow-600/10 border border-yellow-500/30'
            : 'bg-orange-600/10 border border-orange-500/30'
        }`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <MapPin className={`h-6 w-6 ${
              isHighConfidence ? 'text-green-400' : 'text-yellow-400'
            }`} />
            <h3 className="text-lg font-semibold text-white">
              Localisation trouvée !
            </h3>
          </div>
          <p className="text-gray-400">
            Votre photo a été localisée dans l'image globale
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <Badge className={isHighConfidence ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
              Confiance: {confidencePercent}%
            </Badge>
            <Badge variant="outline" className="text-gray-400">
              Similarité: {confidencePercent}%
            </Badge>
          </div>
        </div>

        {/* Vue côte à côte */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Image requête (photo de l'utilisateur) */}
          <Card className="bg-white/5 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-400 flex items-center gap-1">
                  <Camera className="h-4 w-4" />
                  Votre photo
                </p>
              </div>
              <img 
                src={queryImageSrc}
                alt="Votre capture"
                className="w-full rounded-lg object-cover"
                style={{ maxHeight: '300px' }}
              />
            </CardContent>
          </Card>

          {/* Image globale avec zone encadrée */}
          <Card className="bg-white/5 border-green-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-400 flex items-center gap-1">
                  <Target className="h-4 w-4 text-green-400" />
                  Image globale: {globalImage.filename}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullscreen(!showFullscreen)}
                  className="h-8 w-8 p-0"
                >
                  {showFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="relative">
                {globalImage.image ? (
                  <div className={`bg-gray-800 rounded-lg overflow-hidden relative group ${showFullscreen ? 'fixed inset-4 z-50 flex items-center justify-center bg-black/90 p-4' : 'flex justify-center w-full p-2'}`}>
                    {showFullscreen && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFullscreen(false)}
                        className="absolute top-6 right-6 z-[60] bg-black/50 text-white hover:bg-black/70"
                      >
                        <XCircle className="h-6 w-6" />
                      </Button>
                    )}
                    <div className="relative inline-block max-w-full shadow-lg">
                      <img 
                        src={`data:image/jpeg;base64,${globalImage.image}`} 
                        alt={globalImage.filename}
                        className="max-w-full h-auto rounded"
                        style={showFullscreen ? { maxHeight: '90vh' } : { maxHeight: '400px' }}
                      />
                      <div 
                        className="absolute border-4 border-green-500 bg-green-500/20 cursor-pointer transition-all hover:bg-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.5)] group-hover:border-green-400"
                        style={{
                          left: `${matchedZone.x}%`,
                          top: `${matchedZone.y}%`,
                          width: `${matchedZone.width}%`,
                          height: `${matchedZone.height}%`
                        }}
                      >
                        <div className="absolute -top-6 left-0 bg-green-500 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap font-semibold shadow-md">
                          Localisation trouvée ({Math.round(matchedZone.confidence * 100)}%)
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-lg overflow-hidden relative">
                    <div 
                      className="absolute border-4 border-green-500 bg-green-500/20 cursor-pointer transition-all hover:bg-green-500/30"
                      style={{
                        left: `${matchedZone.x}%`,
                        top: `${matchedZone.y}%`,
                        width: `${matchedZone.width}%`,
                        height: `${matchedZone.height}%`
                      }}
                    >
                      <div className="absolute -top-6 left-0 bg-green-500 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                        Zone correspondante
                      </div>
                    </div>
                    <div className="aspect-video bg-gray-700 flex items-center justify-center">
                      <p className="text-gray-500">⚠️ Image globale introuvable</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                La zone verte indique l'emplacement de votre photo
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3">
          <Button
            onClick={onRetry}
            variant="outline"
            disabled={isProcessing}
            className="gap-2"
          >
            🔄 Nouvelle recherche
          </Button>
          <Button
            onClick={onRegisterGlobal}
            disabled={isProcessing}
            className="gap-2 bg-blue-600 hover:bg-blue-500"
          >
            📸 Enregistrer cette localisation
          </Button>
        </div>

        {isProcessing && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto" />
          </div>
        )}
      </div>
    );
  }

  // ========================================================================
  // CAS 2 : AUCUNE LOCALISATION TROUVÉE
  // ========================================================================
  return (
    <div className="space-y-6">
      {/* Message d'échec */}
      <div className="text-center p-6 bg-yellow-600/10 border border-yellow-500/30 rounded-lg">
        <XCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Aucune localisation trouvée
        </h3>
        <p className="text-gray-400">
          {result.message || "L'image n'a pas pu être localisée dans les pupitres existants"}
        </p>
        {result.similarity > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            Meilleure similarité: {Math.round(result.similarity * 100)}%
          </p>
        )}
      </div>

      {/* Aperçu de la photo */}
      <Card className="bg-white/5 border-gray-700 max-w-md mx-auto">
        <CardContent className="p-4">
          <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
            <Camera className="h-4 w-4" />
            Votre photo
          </p>
          <img 
            src={queryImageSrc}
            alt="Votre capture"
            className="w-full rounded-lg"
          />
        </CardContent>
      </Card>

      {/* Suggestions d'action */}
      <div className="space-y-3">
        <p className="text-center text-sm text-gray-500">
          💡 Que souhaitez-vous faire ?
        </p>
        <div className="flex flex-col gap-2 max-w-md mx-auto">
          <Button
            onClick={onRetry}
            variant="outline"
            disabled={isProcessing}
            className="gap-2"
          >
            🔄 Réessayer avec une autre image
          </Button>
          <Button
            onClick={onRegisterGlobal}
            disabled={isProcessing}
            className="gap-2 bg-blue-600 hover:bg-blue-500"
          >
            📸 Ajouter comme nouvelle image globale
          </Button>
        </div>
      </div>

      {isProcessing && (
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto" />
        </div>
      )}
    </div>
  );
}

// ========================================================================
// COMPOSANT D'AIDE POUR LE CHOIX DE L'IMAGE GLOBALE
// ========================================================================
interface GlobalImageSelectorProps {
  images: Array<{ id: string; filename: string; description: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

export function GlobalImageSelector({ 
  images, 
  selectedId, 
  onSelect, 
  isLoading = false 
}: GlobalImageSelectorProps) {
  if (isLoading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto" />
        <p className="text-sm text-gray-500 mt-2">Chargement des pupitres...</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        <p>Aucun pupitre enregistré</p>
        <p className="text-xs mt-1">Commencez par enregistrer une image globale</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-400">Sélectionner un pupitre de référence</label>
      <div className="grid gap-2">
        {images.map((img) => (
          <div
            key={img.id}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedId === img.id
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'
            }`}
            onClick={() => onSelect(img.id)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-200">{img.filename}</p>
                {img.description && (
                  <p className="text-xs text-gray-500">{img.description}</p>
                )}
              </div>
              {selectedId === img.id && (
                <CheckCircle className="h-5 w-5 text-green-400" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}