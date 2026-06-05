// src/lib/hooks/useCamera.ts
'use client';

import { useState, useCallback, useRef } from 'react';

interface CameraState {
  isActive: boolean;
  capturedImage: string | null;
  facingMode: 'user' | 'environment';
  error: string | null;
  stream: MediaStream | null;
}

interface UseCameraReturn extends CameraState {
  startCamera: () => Promise<MediaStream | null>;
  stopCamera: () => void;
  captureImage: (imageSrc: string) => void;
  resetCapture: () => void;
  toggleCamera: () => void;
  takeScreenshot: (videoElement: HTMLVideoElement) => string | null;
}

export function useCamera(): UseCameraReturn {
  const [state, setState] = useState<CameraState>({
    isActive: false,
    capturedImage: null,
    facingMode: 'environment',
    error: null,
    stream: null
  });

  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async (): Promise<MediaStream | null> => {
    try {
      // Arrêter tout flux existant
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: state.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      streamRef.current = stream;
      setState(prev => ({ 
        ...prev, 
        isActive: true, 
        error: null,
        stream 
      }));
      
      return stream;
    } catch (error) {
      console.error('Erreur caméra:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Impossible d\'accéder à la caméra. Vérifiez les permissions.' 
      }));
      return null;
    }
  }, [state.facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setState(prev => ({ 
      ...prev, 
      isActive: false, 
      stream: null 
    }));
  }, []);

  const captureImage = useCallback((imageSrc: string) => {
    setState(prev => ({ 
      ...prev, 
      capturedImage: imageSrc,
      isActive: false 
    }));
    stopCamera();
  }, [stopCamera]);

  const resetCapture = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      capturedImage: null,
      isActive: true 
    }));
  }, []);

  const toggleCamera = useCallback(() => {
    setState(prev => ({
      ...prev,
      facingMode: prev.facingMode === 'user' ? 'environment' : 'user'
    }));
    
    // Redémarrer la caméra avec le nouveau mode
    if (state.isActive) {
      stopCamera();
      setTimeout(() => startCamera(), 100);
    }
  }, [state.isActive, startCamera, stopCamera]);

  const takeScreenshot = useCallback((videoElement: HTMLVideoElement): string | null => {
    if (!videoElement) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    return canvas.toDataURL('image/jpeg', 0.9);
  }, []);

  return {
    ...state,
    startCamera,
    stopCamera,
    captureImage,
    resetCapture,
    toggleCamera,
    takeScreenshot
  };
}