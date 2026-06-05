// src/components/vision/CameraCapture.tsx
'use client';

import { useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Camera, RotateCw, X } from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { Input } from '@/components/ui/input';
import React from 'react';

interface CameraCaptureProps {
  onCapture: (imageSrc: string, textQuery?: string) => void;
  onCancel: () => void;
  captureMode?: 'standard' | 'with-text';
}

export default function CameraCapture({ onCapture, onCancel, captureMode = 'standard' }: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const [textQuery, setTextQuery] = React.useState('');
  
  const {
    capturedImage,
    error,
    startCamera,
    stopCamera,
    resetCapture,
    toggleCamera
  } = useCamera();

  // Démarrer la caméra au montage
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleCapture = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        if (captureMode === 'with-text' && textQuery.trim()) {
          // Passer la requête texte avec l'image
          onCapture(imageSrc, textQuery);
        } else {
          onCapture(imageSrc);
        }
      }
    }
  };

  const handleRetake = () => {
    resetCapture();
  };

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-red-500 mb-4">❌ Erreur: {error}</p>
        <Button onClick={startCamera} variant="outline">
          Réessayer
        </Button>
        <Button onClick={onCancel} variant="ghost" className="ml-2">
          Annuler
        </Button>
      </div>
    );
  }

  // Affichage de l'image capturée (pour reprise)
  if (capturedImage) {
    return (
      <div className="space-y-4">
        <div className="relative rounded-lg overflow-hidden bg-black">
          <img src={capturedImage} alt="Capture" className="w-full" />
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={handleRetake} variant="outline" className="gap-2">
            <RotateCw className="w-4 h-4" />
            Reprendre
          </Button>
          <Button 
            onClick={() => {
              if (captureMode === 'with-text' && textQuery.trim()) {
                onCapture(capturedImage, textQuery);
              } else {
                onCapture(capturedImage);
              }
            }} 
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <Camera className="w-4 h-4" />
            Utiliser cette photo
          </Button>
        </div>
      </div>
    );
  }

  // Mode avec texte (recherche hybride)
  if (captureMode === 'with-text') {
    return (
      <div className="space-y-4">
        <div className="bg-gray-800/30 rounded-lg p-4">
          <label className="text-sm text-gray-400 mb-2 block">
            🔍 Description de l'équipement recherché
          </label>
          <Input
            type="text"
            placeholder="Ex: pompe industrielle rouge avec manomètre..."
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            className="bg-gray-900 border-gray-700"
          />
        </div>
        
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            className="w-full h-full object-cover"
            videoConstraints={{
              facingMode: "environment"
            }}
          />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
            <Button onClick={handleCapture} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Camera className="w-5 h-5" />
              {textQuery.trim() ? 'Capturer et rechercher' : 'Capturer'}
            </Button>
            <Button onClick={toggleCamera} variant="outline" size="icon">
              <RotateCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex justify-center">
          <Button onClick={onCancel} variant="ghost" className="gap-2">
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </div>
        
        {!textQuery.trim() && (
          <p className="text-xs text-gray-500 text-center">
            💡 Saisissez une description pour une recherche hybride plus précise
          </p>
        )}
      </div>
    );
  }

  // Mode standard (recherche par image uniquement)
  return (
    <div className="space-y-4">
      <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          className="w-full h-full object-cover"
          videoConstraints={{
            facingMode: "environment"
          }}
        />
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
          <Button onClick={handleCapture} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Camera className="w-5 h-5" />
            Capturer
          </Button>
          <Button onClick={toggleCamera} variant="outline" size="icon">
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex justify-center">
        <Button onClick={onCancel} variant="ghost" className="gap-2">
          <X className="w-4 h-4" />
          Annuler
        </Button>
      </div>
    </div>
  );
}