// lib/services/sttService.ts
import voskProvider from './sttProviders/voskProvider';
import webSpeechProvider from './sttProviders/webSpeechProvider';
import { STTOptions, STTResult } from '@/types/voice';

// 🔧 INTERFACE POUR LES PROVIDERS
interface STTProvider {
  initialize: () => Promise<boolean>;
  isInitialized: () => Promise<boolean>;
  isListening: () => Promise<boolean>;
  startListening: (options: STTOptions, onResult: (result: STTResult) => void, onError: (error: string) => void) => Promise<void>;
  stopListening: () => Promise<string>;
  transcribeFile: (audioBuffer: Buffer, options: STTOptions) => Promise<string>;
  isAvailable: () => Promise<boolean>;
  getCurrentVolume?: () => number;
}

class STTService {
  private providers: Record<string, STTProvider>;
  private defaultProvider: 'webspeech' | 'vosk';
  private fallbackProvider: 'webspeech';

  constructor() {
    this.providers = {
      vosk: voskProvider as any,
      webspeech: webSpeechProvider as any
    };
    
    // Changement du défaut vers webspeech pour éviter les problèmes de compilation native
    this.defaultProvider = 'webspeech'; 
    this.fallbackProvider = 'webspeech';
    
    console.log('✅ Service STT initialisé (Défaut: WebSpeech)');
  }

  async initialize(provider: 'vosk' | 'webspeech' = this.defaultProvider): Promise<boolean> {
    try {
      const sttProvider = this.providers[provider];
      if (!sttProvider) return false;
      return await sttProvider.initialize();
    } catch (error) {
      console.error('❌ Erreur initialisation STT:', error);
      return false;
    }
  }

  async startListening(
    options: STTOptions = {},
    onResult: (result: STTResult) => void,
    onError: (error: string) => void
  ): Promise<void> {
    const provider = (options.model || this.defaultProvider) as 'vosk' | 'webspeech';
    
    try {
      const sttProvider = this.providers[provider];
      
      // Si Vosk est demandé mais non disponible, basculer sur WebSpeech
      if (provider === 'vosk' && !(await sttProvider.isAvailable())) {
        console.log('🔄 Vosk non disponible, basculement vers WebSpeech...');
        return this.startListening({ ...options, model: 'webspeech' }, onResult, onError);
      }

      if (!sttProvider) throw new Error(`Provider non trouvé: ${provider}`);

      if (!await sttProvider.isInitialized()) {
        await sttProvider.initialize();
      }

      await sttProvider.startListening(options, onResult, onError);
      
    } catch (error) {
      console.error('❌ Erreur démarrage STT:', error);
      if (provider !== this.fallbackProvider) {
        return this.startListening({ ...options, model: this.fallbackProvider }, onResult, onError);
      }
      onError(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  }

  async stopListening(): Promise<string> {
    for (const provider of Object.values(this.providers)) {
      if (provider.isListening && await provider.isListening()) {
        return await provider.stopListening();
      }
    }
    return '';
  }

  async transcribeFile(audioBuffer: Buffer, options: STTOptions = {}): Promise<string> {
    const provider = (options.model || this.defaultProvider) as 'vosk' | 'webspeech';
    const sttProvider = this.providers[provider];
    if (provider === 'webspeech') throw new Error('WebSpeech ne supporte pas la transcription de fichiers côté serveur');
    return await sttProvider.transcribeFile(audioBuffer, options);
  }

  async checkHealth(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      try {
        status[name] = await provider.isAvailable();
      } catch {
        status[name] = false;
      }
    }
    return status;
  }

  getCurrentVolume(): number {
    for (const provider of Object.values(this.providers)) {
      if (provider.getCurrentVolume) {
        const volume = provider.getCurrentVolume();
        if (volume > 0) return volume;
      }
    }
    return 0;
  }
}

export default new STTService();