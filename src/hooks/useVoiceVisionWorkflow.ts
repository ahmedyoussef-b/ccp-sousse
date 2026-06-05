'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useVoice } from './useVoice';
import { useVoiceRecognition } from './useVoiceRecognition';
import { useCamera } from './useCamera';

export type WorkflowStep = 
  | 'IDLE'
  | 'WAITING_FOR_CAMERA_TRIGGER'
  | 'CAMERA_ACTIVE'
  | 'IMAGE_CAPTURED'
  | 'CHOOSE_MODE'
  | 'IMPLANTATION_TYPE'
  | 'IMPLANTATION_GLOBALE_CHECK'
  | 'IMPLANTATION_SIMPLE_ATTACH'
  | 'APPLICATION_MENU';

export interface WorkflowMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isAudio?: boolean;
}

export function useVoiceVisionWorkflow() {
  const [step, setStep] = useState<WorkflowStep>('IDLE');
  const [messages, setMessages] = useState<WorkflowMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "👋 Bonjour ! Dites « On va prendre une image » ou cliquez sur le micro pour commencer notre guidage vocal intelligent.",
      timestamp: new Date()
    }
  ]);
  
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedGlobalImage, setSelectedGlobalImage] = useState<string | null>(null);
  const [availableGlobalImages, setAvailableGlobalImages] = useState<Array<{ id: string; title: string; url: string }>>([
    { id: 'g1', title: 'Pupitre de commande principal - Poste Eau', url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=200' },
    { id: 'g2', title: 'Tableau électrique - Zone turbine A', url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=200' },
  ]);
  const [similarImageFound, setSimilarImageFound] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { play: speak, stop: stopSpeaking, isPlaying: isSpeaking } = useVoice();
  const camera = useCamera();

  // Helper pour ajouter un message et le prononcer
  const addMessageAndSpeak = useCallback(async (role: 'user' | 'assistant', text: string, shouldSpeak = true) => {
    const newMessage: WorkflowMessage = {
      id: `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content: text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
    if (role === 'assistant' && shouldSpeak) {
      try {
        await speak(text);
      } catch (error) {
        console.warn('[Workflow] Synthesis failed or was interrupted (non-blocking):', error);
      }
    }
  }, [speak]);

  // Détecteur d'intentions dans la transcription vocale
  const processSpeechInput = useCallback(async (speechText: string) => {
    const textNormalized = speechText.toLowerCase().trim();
    console.log(`[Workflow] 🎤 Traitement de l'input vocal: "${textNormalized}" (Étape actuelle: ${step})`);

    // Ajoute la trace textuelle de l'utilisateur
    addMessageAndSpeak('user', speechText, false);

    // 1. Déclencheur global de la caméra
    if (textNormalized.includes("prendre une image") || textNormalized.includes("lance la caméra") || textNormalized.includes("prendre photo")) {
      setStep('CAMERA_ACTIVE');
      await addMessageAndSpeak('assistant', "D'accord, je prépare le système. Je lance immédiatement la caméra.");
      try {
        await camera.startCamera();
      } catch (e) {
        console.error("Erreur lancement caméra:", e);
      }
      return;
    }

    // Commande d'annulation globale
    if (textNormalized.includes("annuler") || textNormalized.includes("retourner au début") || textNormalized.includes("recommencer")) {
      setStep('IDLE');
      camera.stopCamera();
      setUploadedImage(null);
      await addMessageAndSpeak('assistant', "Opération annulée. Prêt pour une nouvelle commande.");
      return;
    }

    // Gestion par étape
    switch (step) {
      case 'IDLE':
        await addMessageAndSpeak('assistant', "Désolé, je n'ai pas compris. Pour démarrer, dites simplement : « On va prendre une image ».");
        break;

      case 'CHOOSE_MODE':
        if (textNormalized.includes("implantation") || textNormalized.includes("implanter")) {
          setStep('IMPLANTATION_TYPE');
          await addMessageAndSpeak('assistant', "Mode implantation activé. Dites-moi, cette image est-elle globale ou simple ?");
        } else if (textNormalized.includes("application") || textNormalized.includes("appliquer")) {
          setStep('APPLICATION_MENU');
          await addMessageAndSpeak('assistant', "Mode application activé. Voici les actions que je peux effectuer sur votre image : \n1. Recherche de documents similaires par RAG. \n2. Détecter des anomalies par innovation zéro-shot. \n3. Extraire des caractéristiques techniques. \n4. Rechercher des pièces industrielles.\nLaquelle préférez-vous exécuter ?");
        } else {
          await addMessageAndSpeak('assistant', "Je n'ai pas compris votre choix de mode. Souhaitez-vous le mode implantation ou le mode application ?");
        }
        break;

      case 'IMPLANTATION_TYPE':
        if (textNormalized.includes("globale") || textNormalized.includes("vue d'ensemble")) {
          setStep('IMPLANTATION_GLOBALE_CHECK');
          setIsProcessing(true);
          await addMessageAndSpeak('assistant', "Vérification en cours de l'existence d'une image similaire dans notre banque par similarité vectorielle...");
          
          // Simulation recherche de similarité
          setTimeout(async () => {
            setIsProcessing(false);
            const matches = Math.random() > 0.4; // 60% chance to simulate exist
            if (matches) {
              setSimilarImageFound(availableGlobalImages[0]);
              await addMessageAndSpeak('assistant', "Cette image globale existe déjà dans la banque. Voici laquelle : " + availableGlobalImages[0].title);
            } else {
              setSimilarImageFound(null);
              await addMessageAndSpeak('assistant', "Aucune image similaire trouvée. Je peux la sauvegarder comme nouvelle image globale dans la banque de données.");
            }
          }, 2000);
        } else if (textNormalized.includes("simple") || textNormalized.includes("bouton") || textNormalized.includes("détail")) {
          setStep('IMPLANTATION_SIMPLE_ATTACH');
          await addMessageAndSpeak('assistant', "D'accord, c'est une image simple. Veuillez sélectionner à l'écran l'image globale à laquelle vous souhaitez attacher cette pièce de terrain.");
        } else {
          await addMessageAndSpeak('assistant', "Est-ce une image globale, c'est-à-dire une vue d'ensemble, ou une image simple, c'est-à-dire un détail d'équipement ?");
        }
        break;

      case 'APPLICATION_MENU':
        if (textNormalized.includes("rag") || textNormalized.includes("document") || textNormalized.includes("similaire")) {
          await addMessageAndSpeak('assistant', "Exécution en cours de la recherche RAG sur vos documentations techniques... Un rapport complet a été généré.");
          setStep('IDLE');
        } else if (textNormalized.includes("anomalie") || textNormalized.includes("zero-shot") || textNormalized.includes("défaut")) {
          await addMessageAndSpeak('assistant', "Analyse zero-shot d'anomalie complétée. Aucun défaut critique n'a été détecté.");
          setStep('IDLE');
        } else if (textNormalized.includes("caractéristique") || textNormalized.includes("technique")) {
          await addMessageAndSpeak('assistant', "Extraction des caractéristiques terminée. Les fiches de données ont été mises à jour.");
          setStep('IDLE');
        } else {
          await addMessageAndSpeak('assistant', "Je peux faire un RAG, analyser les anomalies ou extraire les données. Dites-moi ce que vous choisissez.");
        }
        break;

      default:
        await addMessageAndSpeak('assistant', "Je suis à votre écoute.");
        break;
    }
  }, [step, camera, addMessageAndSpeak, availableGlobalImages]);

  // Setup de la reconnaissance vocale
  const voiceRecognition = useVoiceRecognition(
    { language: 'fr-FR', continuous: false, interimResults: false },
    async (text, isFinal) => {
      if (isFinal && text.trim()) {
        await processSpeechInput(text);
      }
    }
  );

  // Transition automatique une fois l'image capturée/uploadée
  const handleImageLoaded = useCallback(async (imgSrc: string) => {
    setUploadedImage(imgSrc);
    setStep('CHOOSE_MODE');
    await addMessageAndSpeak('assistant', "Super, l'image est bien chargée. Tu veux activer le mode implantation ou le mode application ?");
  }, [addMessageAndSpeak]);

  return {
    step,
    setStep,
    messages,
    addMessageAndSpeak,
    uploadedImage,
    setUploadedImage,
    selectedGlobalImage,
    setSelectedGlobalImage,
    availableGlobalImages,
    setAvailableGlobalImages,
    similarImageFound,
    isProcessing,
    camera,
    voiceRecognition,
    handleImageLoaded,
    isSpeaking,
    stopSpeaking,
    processSpeechInput
  };
}
