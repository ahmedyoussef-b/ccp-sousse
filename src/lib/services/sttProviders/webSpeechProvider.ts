// lib/services/sttProviders/webSpeechProvider.ts
import { STTOptions, STTResult } from '@/types/voice';

// 🔧 DÉCLARATION DES TYPES POUR WEB SPEECH API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResult[];
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionError extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionError) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

// 🔧 EXTENSION DE L'INTERFACE WINDOW
declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
    SpeechRecognition: new () => SpeechRecognition;
  }
}

class WebSpeechProvider {
  private recognition: SpeechRecognition | null = null;
  private isListeningFlag: boolean = false;
  private finalTranscript: string = '';

  /**
   * Vérifier si disponible (côté client uniquement)
   */
  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined' && 
           ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }

  /**
   * Initialisation (rien à faire côté serveur)
   */
  async initialize(): Promise<boolean> {
    return this.isAvailable();
  }

  /**
   * Vérifier si initialisé
   */
  async isInitialized(): Promise<boolean> {
    return this.isAvailable();
  }

  /**
   * Vérifier si en cours d'écoute
   */
  async isListening(): Promise<boolean> {
    return this.isListeningFlag;
  }

  /**
   * Démarrer l'écoute (côté client uniquement)
   */
  async startListening(
    options: STTOptions,
    onResult: (result: STTResult) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (typeof window === 'undefined') {
      onError('WebSpeech non disponible côté serveur');
      return;
    }

    try {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      
      if (!SpeechRecognition) {
        throw new Error('WebSpeech non supporté');
      }

      this.recognition = new SpeechRecognition();
      
      // Configuration
      this.recognition.continuous = options.continuous ?? true;
      this.recognition.interimResults = options.interimResults ?? true;
      this.recognition.lang = options.language || 'fr-FR';
      this.recognition.maxAlternatives = 1;

      this.finalTranscript = '';

      // Gestion des résultats
      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            this.finalTranscript += transcript + ' ';
            onResult({
              text: this.finalTranscript,
              isFinal: true
            });
          } else {
            interimTranscript += transcript;
            onResult({
              text: interimTranscript,
              isFinal: false
            });
          }
        }
      };

      // Gestion des erreurs
      this.recognition.onerror = (event: SpeechRecognitionError) => {
        onError(event.error);
      };

      // Fin de l'écoute
      this.recognition.onend = () => {
        this.isListeningFlag = false;
        if (this.finalTranscript) {
          onResult({
            text: this.finalTranscript,
            isFinal: true
          });
        }
      };

      // Démarrer
      this.recognition.start();
      this.isListeningFlag = true;

    } catch (error) {
      this.isListeningFlag = false;
      onError(error instanceof Error ? error.message : 'Erreur WebSpeech');
    }
  }

  /**
   * Arrêter l'écoute
   */
  async stopListening(): Promise<string> {
    if (this.recognition && this.isListeningFlag) {
      this.recognition.stop();
      this.isListeningFlag = false;
    }
    return this.finalTranscript;
  }

  /**
   * Transcrire un fichier (non supporté côté serveur)
   */
  async transcribeFile(): Promise<string> {
    throw new Error('WebSpeech ne supporte pas la transcription de fichiers');
  }

  /**
   * Obtenir le volume (non supporté)
   */
  getCurrentVolume(): number {
    return 0;
  }
}

export default new WebSpeechProvider();