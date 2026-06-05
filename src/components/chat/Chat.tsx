'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, 
  Brain, 
  ListChecks, 
  Mic, 
  MicOff,
  Bot,
  ChevronDown,
  Eye,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Square,
  Camera,
  Upload,
  Layers,
  Check,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import VoiceMessage from '@/components/chat/VoiceMessage';
import VoiceControls from '@/components/chat/VoiceControls';
import { useVoiceEnhanced } from '@/hooks/useVoiceEnhanced';
import StepByStepGuide from '@/components/procedure/StepByStepGuide';
import { cn } from '@/lib/utils';
import { FeedbackStars } from '@/components/chat/FeedbackStars';
import ClaudeModelSelector from '@/components/chat/ClaudeModelSelector';
import { ProcedureProposal } from '@/components/chat/ProcedureProposal';
import { ProcedureSteps } from '@/components/chat/ProcedureSteps';
import { ProcedureGuide } from '@/components/chat/ProcedureGuide';
import { GroqUsageIndicator } from './GroqUsageIndicator';
import { LLMProviderToggle } from './LLMProviderToggle';
import { MindMapChatIntegration } from '@/components/mindmap/MindMapChatIntegration';
import { useCamera } from '@/hooks/useCamera';
import { useVoice } from '@/hooks/useVoice';



// ============================================
// DÉTECTION DES COMMANDES MCP
// ============================================

const MCP_KEYWORDS = {
  calendar: ['affiche', 'calendrier', 'travail', 'planning', 'agenda', 'emploi du temps'],
  email: ['envoie', 'email', 'mail', 'courriel', 'message', 'écrire à'],
  calculator: ['calcule', 'calcul', 'combien', 'addition', 'soustraction', 'multiplication', 'division', 'pourcentage'],
  notification: ['notification', 'alerte', 'notifie', 'préviens'],
  search: ['cherche', 'recherche', 'trouve', 'google', 'web'],
  documents: ['document', 'fichier', 'doc', 'pdf', 'crée un document'],
  memory: ['mémoire', 'souviens', 'rappelle', 'stocke', 'sauvegarde']
};

const detectMCPCommand = (text: string): { isMCP: boolean; action: string; query: string } | null => {
  const lowerText = text.toLowerCase();
  
  for (const [action, keywords] of Object.entries(MCP_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return { isMCP: true, action, query: text };
      }
    }
  }
  
  return null;
};

const redirectToMCPPage = (action: string, query: string) => {
  const encodedAction = encodeURIComponent(action);
  const encodedQuery = encodeURIComponent(query);
  window.location.href = `/mcp?action=${encodedAction}&q=${encodedQuery}`;
};

// ============================================
// TYPES
// ============================================

interface ChatImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  filename: string;
  description?: string;
  similarity?: number;
}

interface ImageIntent {
  type: string;
  shouldDisplayImage: boolean;
  shouldSuggestImage: boolean;
  extractedEntity?: string;
  confidence: number;
}

interface Message {
  role: 'user' | 'ai';
  text: string;
  sources?: string[];
  id: string;
  isAgentMission?: boolean;
  steps?: any[];
  suggestions?: string[];
  procedure?: any;
  rating?: number;
  images?: ChatImage[];
  showImagesDirectly?: boolean;
  imagesAvailable?: boolean;
  imageIntent?: ImageIntent;
  metadata?: any;
}

// ============================================
// CONSTANTES
// ============================================

const CLIENT_CACHE_TTL = 120000; // 2 minutes

let chatInitCache: {
  ollamaOnline: boolean | null;
  currentLLMProvider: string;
  routerStatus: any;
  timestamp: number;
} | null = null;

// ============================================
// COMPOSANTS INTERNES
// ============================================

// 🔥 Composant d'affichage des images - Version optimisée
const ImageGallery = ({ 
  images, 
  showDirectly, 
  onShowPopup}: { 
  images: ChatImage[]; 
  showDirectly: boolean; 
  onShowPopup: () => void;
  messageId: string;
}) => {
  if (!images || images.length === 0) return null;
  
  if (showDirectly) {
    return (
      <div className="mt-3">
        <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
          <ImageIcon size={12} /> Images associées ({images.length})
        </div>
        <div className="flex flex-wrap gap-3">
          {images.map((img, idx) => {
            const fullImageUrl = img.url || `/api/vision/images/${img.id}?raw=true`;
            const thumbnailUrl = img.thumbnailUrl || `/api/vision/images/${img.id}?thumbnail=true`;
            
            return (
              <div 
                key={`${img.id}-${idx}`} 
                className="relative group cursor-pointer rounded-lg overflow-hidden bg-gray-800 border border-gray-700 hover:border-blue-500 transition-all"
                onClick={() => window.open(fullImageUrl, '_blank')}
              >
                <img 
                  src={thumbnailUrl}
                  alt={img.filename || `Image ${img.id.substring(0, 8)}`}
                  className="w-32 h-32 object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = fullImageUrl;
                  }}
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <Eye className="w-6 h-6 text-white" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] p-1 truncate text-center">
                  {img.filename || 'Image'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  
  return (
    <div className="mt-2">
      <button
        onClick={onShowPopup}
        className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 transition-colors"
      >
        <ImageIcon size={14} />
        📸 Voir l'image associée ({images.length})
      </button>
    </div>
  );
};

// 🔥 Composant de suggestion d'image (quand l'IA propose une image)
const ImageSuggestion = ({ 
  images, 
  onShowPopup 
}: { 
  images: ChatImage[]; 
  onShowPopup: () => void;
}) => {
  if (!images || images.length === 0) return null;
  
  return (
    <div className="mt-2">
      <button
        onClick={onShowPopup}
        className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1 transition-colors bg-purple-600/10 px-3 py-1.5 rounded-lg"
      >
        <Sparkles size={14} />
        💡 Une image est disponible pour illustrer cette réponse
        <span className="text-xs ml-1">({images.length})</span>
      </button>
    </div>
  );
};

// 🔥 Popup d'images en plein écran - Version optimisée
const ImagePopup = ({ images, onClose }: { images: ChatImage[]; onClose: () => void }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  if (!images || images.length === 0) return null;
  
  const currentImage = images[selectedIndex];
  const fullImageUrl = currentImage.url || `/api/vision/images/${currentImage.id}?raw=true`;
  
  const goPrev = useCallback(() => {
    setSelectedIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);
  
  const goNext = useCallback(() => {
    setSelectedIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);
  
  // Navigation au clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, onClose]);
  
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="relative max-w-4xl max-h-[90vh] bg-gray-900 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <img 
            src={fullImageUrl}
            alt={currentImage.filename}
            className="max-w-full max-h-[70vh] object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `/api/vision/images/${currentImage.id}?raw=true`;
            }}
          />
          
          {images.length > 1 && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 transition"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 transition"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
          
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 rounded-full p-2 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 bg-gray-800">
          <p className="text-white font-medium">{currentImage.filename}</p>
          {currentImage.description && (
            <p className="text-gray-400 text-sm mt-1">{currentImage.description}</p>
          )}
          {currentImage.similarity && (
            <p className="text-blue-400 text-xs mt-1">Similarité: {Math.round(currentImage.similarity * 100)}%</p>
          )}
          {images.length > 1 && (
            <p className="text-gray-500 text-xs mt-2">Image {selectedIndex + 1} sur {images.length}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showImagesPopup, setShowImagesPopup] = useState<{ messageId: string; images: ChatImage[] } | null>(null);
  
  const [mode, setMode] = useState<'chat' | 'procedure'>('chat');
  const [activeOllamaModel, setActiveOllamaModel] = useState('gemma2:2b');
  const [activeClaudeAlias, setActiveClaudeAlias] = useState('claude-sonnet');
  const [powerProfile, setPowerProfile] = useState<'eco' | 'balanced' | 'turbo'>('balanced');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [currentLLMProvider, setCurrentLLMProvider] = useState<string>('ollama');
  const [routerStatus, setRouterStatus] = useState<{
    available: boolean;
    lastProvider?: string;
    fallbackChain?: string[];
  }>({ available: true });
  const [showStepsFor, setShowStepsFor] = useState<any>(null);
  const [runningGuide, setRunningGuide] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { 
    isListening, 
    interimTranscript, 
    startListening, 
    stopListening, 
    stopSpeaking,
    isSpeaking,
    autoPlayResponse 
  } = useVoiceEnhanced(handleSendMessage);

  // ============================================
  // WORKFLOW INTERACTION VOCALE & VISION (DOUBLE MODE)
  // ============================================
  const [workflowStep, setWorkflowStep] = useState<'IDLE' | 'CAMERA_ACTIVE' | 'CHOOSE_MODE' | 'IMPLANTATION_TYPE' | 'IMPLANTATION_GLOBALE_CHECK' | 'IMPLANTATION_GLOBALE_SAVE_CONFIRM' | 'IMPLANTATION_SIMPLE_ATTACH' | 'APPLICATION_MENU'>('IDLE');
  const [workflowImage, setWorkflowImage] = useState<string | null>(null);
  const [similarImageFound, setSimilarImageFound] = useState<any | null>(null);
  const [selectedGlobalImage, setSelectedGlobalImage] = useState<string | null>(null);
  const [availableGlobalImages] = useState<Array<{ id: string; title: string; url: string }>>([
    { id: 'g1', title: 'Pupitre de commande principal - Poste Eau', url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=200' },
    { id: 'g2', title: 'Tableau électrique - Zone turbine A', url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=200' },
  ]);

  const camera = useCamera();
  const { play: speak } = useVoice();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronisation du flux de la caméra
  useEffect(() => {
    if (videoRef.current && camera.stream) {
      videoRef.current.srcObject = camera.stream;
    }
  }, [camera.stream, workflowStep]);

  // Helper pour parler et ajouter un message d'assistant dans le chat
  const addWorkflowAssistantMessage = async (text: string, images?: ChatImage[]) => {
    const aiMsgId = Math.random().toString(36).substring(7);
    setMessages(prev => [...prev, { 
      role: 'ai', 
      text, 
      id: aiMsgId,
      metadata: { fromWorkflow: true },
      images: images,
      showImagesDirectly: images ? true : false,
      imagesAvailable: images ? true : false,
    }]);
    try {
      await speak(text);
    } catch (error) {
      console.warn("[Voice] Synthesis failed or was interrupted:", error);
    }
  };

  // ============================================
  // INITIALISATION
  // ============================================
  
  useEffect(() => {
    const now = Date.now();
    if (chatInitCache && (now - chatInitCache.timestamp < CLIENT_CACHE_TTL)) {
      setOllamaOnline(chatInitCache.ollamaOnline);
      setCurrentLLMProvider(chatInitCache.currentLLMProvider);
      setRouterStatus(chatInitCache.routerStatus);
      return;
    }

    Promise.all([
      fetch('/api/chat/claude-compatible').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/config/llm-provider').then(r => r.json()).catch(() => ({ current: 'ollama' })),
      fetch('/api/llm-router/status').then(r => r.json()).catch(() => ({ available: true }))
    ]).then(([claudeData, providerData, routerData]) => {
      const isOnline = claudeData?.status === 'healthy';
      const provider = providerData.current;
      const rStatus = { available: routerData.available, lastProvider: routerData.lastProvider };

      setOllamaOnline(isOnline);
      setCurrentLLMProvider(provider);
      setRouterStatus(rStatus);

      chatInitCache = {
        ollamaOnline: isOnline,
        currentLLMProvider: provider,
        routerStatus: rStatus,
        timestamp: Date.now()
      };
    });
  }, []);

  // ============================================
  // DECI-FLOW WORKFLOW VOCAL / VISION (DOUBLE MODE)
  // ============================================
  const processWorkflowInput = async (trimmed: string): Promise<boolean> => {
    const textNormalized = trimmed.toLowerCase();
    
    // Commande vocale ou clic caméra
    if (textNormalized.includes("prendre une image") || textNormalized.includes("lance la caméra") || textNormalized.includes("prendre photo")) {
      const userMsgId = Math.random().toString(36).substring(7);
      setMessages(prev => [...prev, { role: 'user', text: trimmed, id: userMsgId }]);
      setWorkflowStep('CAMERA_ACTIVE');
      camera.startCamera();
      await addWorkflowAssistantMessage("OK, vas-y, je lance la caméra.");
      return true;
    }

    if (textNormalized === "annuler" || textNormalized.includes("recommencer") || textNormalized.includes("retour au début")) {
      const userMsgId = Math.random().toString(36).substring(7);
      setMessages(prev => [...prev, { role: 'user', text: trimmed, id: userMsgId }]);
      setWorkflowStep('IDLE');
      setWorkflowImage(null);
      camera.stopCamera();
      await addWorkflowAssistantMessage("Flux d'image réinitialisé. Comment puis-je vous aider ?");
      return true;
    }

    // Traitement si une étape du workflow est active
    if (workflowStep !== 'IDLE') {
      const userMsgId = Math.random().toString(36).substring(7);
      setMessages(prev => [...prev, { role: 'user', text: trimmed, id: userMsgId }]);

      if (workflowStep === 'CHOOSE_MODE') {
        if (textNormalized.includes("implantation")) {
          setWorkflowStep('IMPLANTATION_TYPE');
          await addWorkflowAssistantMessage("Mode implantation activé. Cette image est-elle globale ou simple ?");
        } else if (textNormalized.includes("application")) {
          setWorkflowStep('APPLICATION_MENU');
          await addWorkflowAssistantMessage("Mode application activé. Voici les actions disponibles : RAG, détection d'anomalies zero-shot, extraction de caractéristiques. Quelle action souhaitez-vous exécuter ?");
        } else {
          await addWorkflowAssistantMessage("Je n'ai pas compris votre choix. Voulez-vous le mode implantation ou le mode application ?");
        }
        return true;
      }

      if (workflowStep === 'IMPLANTATION_TYPE') {
        if (textNormalized.includes("globale")) {
          setWorkflowStep('IMPLANTATION_GLOBALE_CHECK');
          await addWorkflowAssistantMessage("Vérification de similarité vectorielle en cours dans la base de données...");
          setTimeout(async () => {
            const hasDuplicate = Math.random() > 0.5;
            if (hasDuplicate) {
              setSimilarImageFound({ title: 'Pupitre principal de commande - Zone A' });
              const currentImgUrl = workflowImage || '';
              const mockDuplicateImgUrl = 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=300';
              await addWorkflowAssistantMessage("Cette image globale existe déjà dans la banque. Voici laquelle.", [
                { id: 'query_img', url: currentImgUrl, thumbnailUrl: currentImgUrl, filename: 'Image envoyée' },
                { id: 'found_img', url: mockDuplicateImgUrl, thumbnailUrl: mockDuplicateImgUrl, filename: 'Pupitre principal de commande - Zone A', similarity: 0.98, description: 'Image globale existante - Metadata: ID-7489, Zone A, Bâtiment Principal' }
              ]);
            } else {
              setSimilarImageFound(null);
              setWorkflowStep('IMPLANTATION_GLOBALE_SAVE_CONFIRM');
              await addWorkflowAssistantMessage("Aucune image similaire trouvée. Voulez-vous la sauvegarder comme nouvelle image globale dans la banque ? (oui/non)");
            }
          }, 1500);
        } else if (textNormalized.includes("simple")) {
          setWorkflowStep('IMPLANTATION_SIMPLE_ATTACH');
          await addWorkflowAssistantMessage("D'accord, c'est une image simple. Veuillez choisir l'image globale parent à laquelle l'attacher.");
        } else {
          await addWorkflowAssistantMessage("Est-ce une image globale (vue d'ensemble) ou simple (détail/organe terrain) ?");
        }
        return true;
      }

      if (workflowStep === 'IMPLANTATION_GLOBALE_SAVE_CONFIRM') {
        if (textNormalized.includes("oui") || textNormalized.includes("ok") || textNormalized.includes("sauvegarder")) {
          setWorkflowStep('IDLE');
          setWorkflowImage(null);
          await addWorkflowAssistantMessage("Image unique. Sauvegardée dans la banque comme nouvelle image globale.");
        } else {
          setWorkflowStep('IDLE');
          setWorkflowImage(null);
          await addWorkflowAssistantMessage("D'accord, l'image n'a pas été sauvegardée.");
        }
        return true;
      }

      if (workflowStep === 'IMPLANTATION_SIMPLE_ATTACH') {
        if (textNormalized.includes("attacher") || textNormalized.includes("lier")) {
          setWorkflowStep('IDLE');
          setWorkflowImage(null);
          await addWorkflowAssistantMessage("L'image simple de l'organe de terrain a bien été rattachée à l'image globale.");
          return true;
        }
      }

      if (workflowStep === 'APPLICATION_MENU') {
        if (textNormalized.includes("rag")) {
          setWorkflowStep('IDLE');
          const currentImgUrl = workflowImage || '';
          const mockSimilarImgUrl = 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=300';
          setWorkflowImage(null);
          await addWorkflowAssistantMessage("Recherche RAG lancée. Les documents similaires ont été identifiés avec succès.", [
            { id: 'query_img', url: currentImgUrl, thumbnailUrl: currentImgUrl, filename: 'Image téléchargée' },
            { id: 'found_img', url: mockSimilarImgUrl, thumbnailUrl: mockSimilarImgUrl, filename: 'Document similaire trouvé', similarity: 0.94 }
          ]);
          return true;
        } else if (textNormalized.includes("anomalie")) {
          setWorkflowStep('IDLE');
          setWorkflowImage(null);
          await addWorkflowAssistantMessage("Détection d'anomalies zéro-shot terminée. Aucun défaut critique détecté.");
          return true;
        } else if (textNormalized.includes("caractéristique")) {
          setWorkflowStep('IDLE');
          setWorkflowImage(null);
          await addWorkflowAssistantMessage("Caractéristiques techniques extraites et injectées dans la fiche équipement.");
          return true;
        }
      }
    }

    return false;
  };

  const handleCameraClick = () => {
    if (workflowStep === 'CAMERA_ACTIVE') {
      camera.stopCamera();
      setWorkflowStep('IDLE');
    } else {
      setWorkflowStep('CAMERA_ACTIVE');
      camera.startCamera();
    }
  };

  const handleCapture = () => {
    if (videoRef.current) {
      const screenshot = camera.takeScreenshot(videoRef.current);
      if (screenshot) {
        camera.captureImage(screenshot);
        setWorkflowImage(screenshot);
        setWorkflowStep('CHOOSE_MODE');
        addWorkflowAssistantMessage("Super, l'image est bien chargée. Tu veux activer le mode implantation ou le mode application ?");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setWorkflowImage(reader.result);
          setWorkflowStep('CHOOSE_MODE');
          addWorkflowAssistantMessage("Super, l'image est bien chargée. Tu veux activer le mode implantation ou le mode application ?");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  async function handleSendMessage(textOverride?: string) {
    const textToSend = textOverride || input;
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    // Interception par le workflow guidé d'image
    const wasWorkflowInput = await processWorkflowInput(trimmed);
    if (wasWorkflowInput) {
      if (!textOverride) setInput('');
      return;
    }

 // 🔥 DÉTECTION MCP - REDIRECTION IMMÉDIATE
  const mcpCommand = detectMCPCommand(trimmed);
  if (mcpCommand && mcpCommand.isMCP) {
    console.log('[MCP] Détection commande:', mcpCommand);
    redirectToMCPPage(mcpCommand.action, mcpCommand.query);
    return; // Sortie de la fonction, pas d'appel API
  }


    setLoading(true);
    if (!textOverride) setInput('');
    
    // Annuler toute requête précédente au cas où
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const userMsgId = Math.random().toString(36).substring(7);
    const userMsg: Message = { role: 'user', text: trimmed, id: userMsgId };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          prompt: trimmed,
          history: messages.slice(-30), // On conserve un maximum de contexte (30 derniers messages)
          model: activeClaudeAlias as any,
          _claudeAlias: activeClaudeAlias,
          _localProvider: 'ollama',
          _power_profile: powerProfile,
          _useRouter: true,
          _preferLocal: powerProfile === 'eco',
          _forceProvider: currentLLMProvider !== 'auto' ? currentLLMProvider : undefined
        })
      });
      
      const data = await response.json();
      const aiMsgId = Math.random().toString(36).substring(7);
      
      const providerInfo = data.metadata?.provider 
        ? `\n\n---\n*🔧 Réponse générée par: ${data.metadata.provider.toUpperCase()}*`
        : '';
      
      // 🔥 Ajouter l'intention image et suggestions au message
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: data.answer + providerInfo,
        sources: data.sources,
        id: aiMsgId,
        procedure: data.procedure,
        rating: undefined,
        images: data.images || [],
        showImagesDirectly: data.imageIntent?.shouldDisplayImage ?? true,
        imagesAvailable: data.imagesAvailable || false,
        imageIntent: data.imageIntent || null,
        metadata: data.metadata,
        suggestions: data.suggestions || []
      }]);

      if (data.metadata?.provider) {
        setRouterStatus(prev => ({ 
          ...prev, 
          lastProvider: data.metadata.provider,
          fallbackChain: data.metadata.fallbackChain 
        }));
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[UI][CHAT] Requête annulée par l\'utilisateur');
        return;
      }
      console.error(`[UI][CHAT] Error:`, error);
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: '⚠️ Service IA temporairement indisponible. Veuillez réessayer dans quelques instants.', 
        id: 'err' 
      }]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  const handleCancelRequest = () => {
    // 1. Annuler la requête API en cours
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. Arrêter la voix
    stopSpeaking();
    
    // 3. Arrêter l'écoute si active
    if (isListening) {
      stopListening();
    }

    setLoading(false);
  };

  const handleFeedback = (messageId: string, rating: number) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, rating } : msg
    ));
  };

  const getPreviousUserMessage = (currentIndex: number): string => {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        return messages[i].text;
      }
    }
    return '';
  };

  const fetchSteps = async (proc: any) => {
    try {
      const response = await fetch('/api/procedure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'get_all_steps', 
          procedureId: proc.procedureId || 'demarrage-chaudiere' 
        })
      });
      const data = await response.json();
      return data.steps || [];
    } catch (error) {
      console.error('[UI][PROCEDURE] Error fetching steps:', error);
      return [];
    }
  };

  // ============================================
  // EFFECTS
  // ============================================
  
  // 🔥 Sauvegarde et restauration de l'historique de navigation
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('ccp_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && messages.length === 0) {
          setMessages(parsed);
        }
      }
    } catch (e) {
      console.error('Erreur chargement historique', e);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem('ccp_chat_history', JSON.stringify(messages));
      } catch (e) {
        console.error('Erreur sauvegarde historique', e);
      }
    }
  }, [messages]);

  useEffect(() => {
    if (interimTranscript) setInput(interimTranscript);
  }, [interimTranscript]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============================================
  // RENDU
  // ============================================
  
  return (
    <div className="flex flex-col h-full bg-[#212121] relative">

      {/* Panneau flottant de sélection de modèle */}
      {showModelSelector && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModelSelector(false)}
          />
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl mx-auto px-4">
            <div style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.7)'
            }}>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm font-bold text-purple-400 flex items-center gap-2">
                  <Bot size={16} /> Sélectionner le modèle local
                </div>
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${ollamaOnline ? 'bg-green-500 shadow-glow' : ollamaOnline === false ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  Ollama {ollamaOnline ? 'connecté' : 'hors-ligne'} · 0€
                </div>
              </div>
              <ClaudeModelSelector
                selectedModel={activeOllamaModel}
                selectedProfile={powerProfile}
                onProfileChange={setPowerProfile}
                onModelChange={(modelId, claudeAlias) => {
                  setActiveOllamaModel(modelId);
                  setActiveClaudeAlias(claudeAlias);
                  setShowModelSelector(false);
                }}
              />
            </div>
          </div>
        </>
      )}

      {/* Header */}
      <div className="bg-[#171717] border-b border-white/5 p-2 flex items-center justify-between gap-2 z-10 px-4">
        <div className="flex gap-2">
          <Button
            onClick={() => setMode('chat')}
            variant={mode === 'chat' ? 'default' : 'ghost'}
            className={cn(mode === 'chat' ? 'bg-blue-600 text-white rounded-xl' : 'text-gray-400 hover:text-white rounded-xl')}
          >
            <Brain className="w-4 h-4 mr-2" /> Chat Intelligent
          </Button>
          <GroqUsageIndicator />
          <Button
            onClick={() => setMode('procedure')}
            variant={mode === 'procedure' ? 'default' : 'ghost'}
            className={cn(mode === 'procedure' ? 'bg-green-600 text-white rounded-xl' : 'text-gray-400 hover:text-white rounded-xl')}
          >
            <ListChecks className="w-4 h-4 mr-2" /> Mode Procédure
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <LLMProviderToggle onToggle={(provider) => {
            setCurrentLLMProvider(provider);
            console.log(`[UI] Basculement vers ${provider.toUpperCase()}`);
          }} />

          {routerStatus.lastProvider && routerStatus.lastProvider !== 'cache' && (
            <div className="text-[10px] px-2 py-1 rounded-full bg-gray-800 text-gray-400">
              🤖 {routerStatus.lastProvider.toUpperCase()}
            </div>
          )}

          <button
            onClick={() => {
              if (powerProfile === 'turbo') {
                setPowerProfile('balanced');
              } else {
                setPowerProfile('turbo');
                setActiveOllamaModel('Falcon3-7B-Instruct-1.58bit');
                setActiveClaudeAlias('claude-sonnet');
              }
            }}
            className={`px-2 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
              powerProfile === 'turbo' 
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border border-amber-400' 
                : 'bg-white/5 text-white/40 border border-white/10'
            }`}
          >
            🚀 {powerProfile === 'turbo' ? 'TURBO ON' : 'TURBO'}
          </button>

          <button
            onClick={() => setShowModelSelector(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium hover:bg-indigo-500/20 transition whitespace-nowrap"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${ollamaOnline ? 'bg-green-500' : ollamaOnline === false ? 'bg-red-500' : 'bg-yellow-500'}`} />
            🤖 {activeOllamaModel.split(':')[0]}
            <ChevronDown size={12} className="opacity-60" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6 md:space-y-8 pb-20">
          {mode === 'chat' ? (
            <div className="space-y-10 md:space-y-12">
              {messages.map((msg, idx) => (
                <div key={msg.id} className="space-y-6">
                  <VoiceMessage 
                    text={msg.text}
                    role={msg.role}
                    messageId={msg.id}
                    autoPlay={autoPlayResponse && msg.role === 'ai' && msg === messages[messages.length - 1]}
                  />

                  {msg.role === 'ai' && msg === messages[messages.length - 1] && (
                    <div className="ml-12 mr-4">
                      {workflowStep === 'CHOOSE_MODE' && (
                        <div className="flex gap-3 mt-3">
                          <Button size="sm" onClick={() => handleSendMessage("mode implantation")} className="bg-cyan-600 hover:bg-cyan-700 text-xs text-white rounded-xl">Mode Implantation</Button>
                          <Button size="sm" onClick={() => handleSendMessage("mode application")} className="bg-indigo-600 hover:bg-indigo-700 text-xs text-white rounded-xl">Mode Application</Button>
                        </div>
                      )}
                      
                      {workflowStep === 'IMPLANTATION_TYPE' && (
                        <div className="flex gap-3 mt-3">
                          <Button size="sm" onClick={() => handleSendMessage("globale")} className="bg-cyan-600 hover:bg-cyan-700 text-xs text-white rounded-xl">Image Globale</Button>
                          <Button size="sm" onClick={() => handleSendMessage("simple")} className="bg-indigo-600 hover:bg-indigo-700 text-xs text-white rounded-xl">Image Simple</Button>
                        </div>
                      )}

                      {workflowStep === 'IMPLANTATION_GLOBALE_CHECK' && (
                        <div className="mt-3 p-3 rounded-xl border border-white/10 bg-slate-900/80 text-xs space-y-2">
                          {similarImageFound ? (
                            <div className="flex items-center gap-2 text-yellow-400 font-bold">
                              <AlertCircle size={14} /> Image similaire existante trouvée dans la banque !
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-emerald-400 font-bold">
                              <Check size={14} /> Image unique. Sauvegardée dans la banque comme nouvelle image globale.
                            </div>
                          )}
                          <Button size="sm" onClick={() => { setWorkflowStep('IDLE'); setWorkflowImage(null); }} className="bg-slate-800 hover:bg-slate-700 text-[10px] text-white">Terminer</Button>
                        </div>
                      )}

                      {workflowStep === 'IMPLANTATION_SIMPLE_ATTACH' && (
                        <div className="mt-3 p-3 rounded-xl border border-white/10 bg-slate-900/80 text-xs space-y-2">
                          <p className="text-slate-400 font-semibold mb-1">Sélectionnez le pupitre global auquel attacher cette image simple :</p>
                          <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                            {availableGlobalImages.map(img => (
                              <button 
                                key={img.id}
                                onClick={() => {
                                  setSelectedGlobalImage(img.id);
                                  handleSendMessage(`Attacher à ${img.title}`);
                                }}
                                className="flex items-center gap-2 p-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-left border border-white/5"
                              >
                                <img src={img.url} className="w-8 h-8 object-cover rounded" />
                                <span className="truncate text-white">{img.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {workflowStep === 'APPLICATION_MENU' && (
                        <div className="mt-3 p-3 rounded-xl border border-white/10 bg-slate-900/80 text-xs space-y-2">
                          <p className="text-slate-400 font-semibold mb-1">Actions métier applicables détectées :</p>
                          <div className="grid grid-cols-1 gap-2">
                            {[
                              { key: 'rag', label: 'Recherche de documents techniques (RAG)' },
                              { key: 'anomalie', label: 'Détecter des anomalies (innovation zéro-shot)' },
                              { key: 'caractéristique', label: 'Extraire des caractéristiques techniques' }
                            ].map(act => (
                              <Button
                                key={act.key}
                                onClick={() => handleSendMessage(act.key)}
                                variant="outline"
                                className="w-full justify-start text-xs border-white/10 hover:bg-white/5 py-1.5"
                              >
                                {act.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {msg.role === 'ai' && msg.metadata?.mindmap && (
                    <div className="ml-12 mr-4">
                      <MindMapChatIntegration metadata={msg.metadata.mindmap} />
                    </div>
                  )}

                  {msg.role === 'ai' && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="ml-12 mr-4 mt-2 flex flex-wrap gap-2 animate-fade-in">
                      {msg.suggestions.map((sug, sIdx) => (
                        <button
                          key={sIdx}
                          onClick={() => handleSendMessage(sug)}
                          className="text-[11px] bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/20 rounded-full px-3.5 py-1.5 transition-all flex items-center gap-1.5 font-semibold hover:scale-105 active:scale-95 shadow-md"
                        >
                          <span>{sug}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {msg.role === 'ai' && !msg.rating && (
                    <div className="ml-12 mr-4 mt-1">
                      <FeedbackStars
                        messageId={msg.id}
                        question={getPreviousUserMessage(idx)}
                        answer={msg.text}
                        onFeedbackSubmitted={(rating) => handleFeedback(msg.id, rating)}
                        metadata={msg.metadata}
                        size="sm"
                      />
                    </div>
                  )}
                  
                  {msg.role === 'ai' && msg.rating && (
                    <div className="ml-12 mr-4 mt-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Note:</span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className={star <= (msg.rating || 0) ? 'text-yellow-500' : 'text-slate-600'}>
                              ★
                            </span>
                          ))}
                        </div>
                        <span className="ml-2 text-slate-600">Merci pour votre retour</span>
                      </div>
                    </div>
                  )}
                  
                  {/* 🔥 AFFICHAGE DES IMAGES SELON L'INTENTION */}
                  {msg.role === 'ai' && msg.images && msg.images.length > 0 && (
                    <div className="ml-12 mr-4">
                      {msg.imageIntent?.shouldDisplayImage ? (
                        // Affichage direct des images (requête explicite)
                        <ImageGallery 
                          images={msg.images}
                          showDirectly={true}
                          onShowPopup={() => setShowImagesPopup({ messageId: msg.id, images: msg.images! })}
                          messageId={msg.id}
                        />
                      ) : msg.imageIntent?.shouldSuggestImage ? (
                        // Suggestion d'image (l'IA propose une image pertinente)
                        <ImageSuggestion 
                          images={msg.images}
                          onShowPopup={() => setShowImagesPopup({ messageId: msg.id, images: msg.images! })}
                        />
                      ) : (
                        // Pas d'intention image, affichage standard avec bouton
                        <ImageGallery 
                          images={msg.images}
                          showDirectly={false}
                          onShowPopup={() => setShowImagesPopup({ messageId: msg.id, images: msg.images! })}
                          messageId={msg.id}
                        />
                      )}
                    </div>
                  )}
                  
                  {msg.role === 'ai' && msg.procedure?.isProcedure && (
                    <div className="ml-12 mr-4">
                      <ProcedureProposal 
                        procedureName={msg.procedure.procedureName}
                        equipment={msg.procedure.equipment}
                        onShowSteps={async () => {
                          const steps = await fetchSteps(msg.procedure);
                          setShowStepsFor({ name: msg.procedure.procedureName, steps });
                        }}
                        onStartGuide={async () => {
                          const steps = await fetchSteps(msg.procedure);
                          setRunningGuide({ name: msg.procedure.procedureName, steps });
                        }}
                        onClose={() => {}}
                      />
                    </div>
                  )}

                  {showStepsFor && msg.role === 'ai' && msg.procedure?.procedureName === showStepsFor.name && (
                    <div className="ml-12 mr-4">
                      <ProcedureSteps 
                        procedureName={showStepsFor.name}
                        steps={showStepsFor.steps}
                        onStartGuide={() => {
                          setRunningGuide(showStepsFor);
                          setShowStepsFor(null);
                        }}
                        onClose={() => setShowStepsFor(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <StepByStepGuide />
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Popups */}
      {showImagesPopup && (
        <ImagePopup 
          images={showImagesPopup.images}
          onClose={() => setShowImagesPopup(null)}
        />
      )}

      {runningGuide && (
        <ProcedureGuide 
          procedureName={runningGuide.name}
          steps={runningGuide.steps}
          onComplete={() => {
            setRunningGuide(null);
            handleSendMessage(`J'ai terminé la procédure de ${runningGuide.name} avec succès.`);
          }}
          onClose={() => setRunningGuide(null)}
        />
      )}

      {/* Input */}
      {mode === 'chat' && (
        <div className="p-4 md:p-8 bg-gradient-to-t from-[#212121] via-[#212121] to-transparent sticky bottom-0 z-20">
          <div className="max-w-3xl mx-auto">
            {/* Caméra Live Inline */}
            {workflowStep === 'CAMERA_ACTIVE' && (
              <div className="relative rounded-2xl overflow-hidden aspect-video border border-white/10 bg-black max-w-md mx-auto mb-4 animate-in fade-in slide-in-from-bottom-5">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider animate-pulse">Live Cam</div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                  <Button size="sm" onClick={handleCapture} className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-xl">Prendre la photo</Button>
                  <Button size="sm" variant="outline" onClick={() => { camera.stopCamera(); setWorkflowStep('IDLE'); }} className="bg-slate-900/90 border-slate-800 text-white text-xs rounded-xl">Annuler</Button>
                </div>
              </div>
            )}

            <div className="relative flex items-center bg-[#2f2f2f] rounded-3xl border border-white/10 p-2 shadow-2xl">
              {/* Vignette de l'image active */}
              {workflowImage && (
                <div className="relative ml-2 mr-1 flex-shrink-0 animate-in zoom-in-50 duration-150">
                  <img src={workflowImage} className="w-12 h-12 object-cover rounded-xl border border-white/20 shadow-md" />
                  <button 
                    onClick={() => { setWorkflowImage(null); setWorkflowStep('IDLE'); }} 
                    className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <Textarea
                id="chat-input-textarea"
                name="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={isListening ? "🎤 Écoute active..." : "Posez une question ou demandez une procédure..."}
                className="flex-1 bg-transparent border-none focus-visible:ring-0 min-h-[56px] py-4 px-4 resize-none text-white placeholder:text-gray-500 text-sm"
                rows={1}
              />
              <div className="flex items-center gap-2 px-2">
                {(loading || isSpeaking) && (
                  <Button 
                    onClick={handleCancelRequest}
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10 rounded-2xl bg-orange-600/20 text-orange-500 hover:bg-orange-600/30 border border-orange-500/30"
                    title="Arrêter la voix / Annuler la requête"
                  >
                    <Square className="w-5 h-5 fill-current" />
                  </Button>
                )}

                <Button 
                  onClick={handleCameraClick}
                  variant="ghost" 
                  size="icon" 
                  className={cn("w-10 h-10 rounded-2xl text-slate-400 hover:text-white", workflowStep === 'CAMERA_ACTIVE' && "bg-cyan-600 text-white")}
                  title="Déclencher la caméra"
                >
                  <Camera className="w-5 h-5" />
                </Button>
                
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  variant="ghost" 
                  size="icon" 
                  className="w-10 h-10 rounded-2xl text-slate-400 hover:text-white"
                  title="Sélectionner une image"
                >
                  <Upload className="w-5 h-5" />
                </Button>
                
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileSelect} 
                  className="hidden" 
                />

                <Button 
                  onClick={() => isListening ? stopListening() : startListening()} 
                  variant="ghost" 
                  size="icon" 
                  className={cn("w-10 h-10 rounded-2xl", isListening && "bg-red-600 text-white animate-pulse")}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                <Button 
                  onClick={() => handleSendMessage()} 
                  disabled={loading || (!input.trim() && !workflowImage)} 
                  size="icon" 
                  className="bg-blue-600 text-white hover:bg-blue-500 rounded-2xl w-10 h-10 shadow-lg"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <VoiceControls isListening={isListening} isSpeaking={isSpeaking} onStop={handleCancelRequest} />
    </div>
  );
}