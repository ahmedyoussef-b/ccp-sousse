// lib/services/ttsService.ts
import piperProvider from './ttsProviders/piperProvider';
import edgeProvider from './ttsProviders/edgeProvider';
import ttsCache from './ttsCache';
import { VoiceOptions, VoiceResponse, VoiceInfo } from '@/types/voice';
import crypto from 'crypto';

interface TTSProvider {
  synthesize: (text: string, options: any) => Promise<Buffer>;
  checkHealth: () => Promise<boolean>;
  getVoices?: () => Promise<string[] | any[]>;
}

class TTSService {
  private providers: Record<string, TTSProvider>;
  private defaultProvider: 'piper' | 'edge';
  private fallbackProvider: 'piper' | 'edge';
  private cache: typeof ttsCache;
  private voices: Record<string, any>;

  constructor() {
    this.providers = {
      piper: piperProvider as any,
      edge: edgeProvider as any
    };
    
    this.defaultProvider = (process.env.TTS_DEFAULT_PROVIDER as 'piper' | 'edge') || 'edge';
    this.fallbackProvider = 'edge';
    this.cache = ttsCache;
    
    this.voices = {
      'fr-FR': {
        piper: {
          'female-1': 'fr_FR-siwis-medium',
          'male-1': 'fr_FR-mls-medium',
          'default': 'fr_FR-siwis-medium'
        },
        edge: {
          'female-1': 'fr-FR-DeniseNeural',
          'male-1': 'fr-FR-HenriNeural',
          'default': 'fr-FR-DeniseNeural'
        }
      },
      'en-US': {
        piper: {
          'female-1': 'en_US-lessac-medium',
          'male-1': 'en_US-ljspeech-medium',
          'default': 'en_US-lessac-medium'
        },
        edge: {
          'female-1': 'en-US-JennyNeural',
          'male-1': 'en-US-GuyNeural',
          'default': 'en-US-JennyNeural'
        }
      }
    };
  }

  async synthesize(options: VoiceOptions): Promise<VoiceResponse> {
    const {
      text,
      provider = this.defaultProvider,
      voice = 'default',
      language = 'fr-FR',
      speed = 1.0,
      cache = true
    } = options;

    try {
      const selectedProvider = (provider || this.defaultProvider) as 'piper' | 'edge';
      const ttsProvider = this.providers[selectedProvider];
      
      if (!ttsProvider) {
        throw new Error(`Provider TTS non trouvé: ${selectedProvider}`);
      }

      const format = selectedProvider === 'piper' ? 'wav' : 'mp3';
      const cacheKey = this.generateCacheKey(text, { provider: selectedProvider, voice, language, speed }) + '.' + format;
      
      if (cache) {
        const cachedAudio = await this.cache.get(cacheKey);
        if (cachedAudio) {
          return {
            audio: cachedAudio.toString('base64'),
            format: format as 'mp3' | 'wav',
            duration: this.estimateDuration(text),
            fromCache: true
          };
        }
      }

      const voiceModel = this.getVoiceModel(language, selectedProvider, voice);
      const audioBuffer = await ttsProvider.synthesize(text, {
        voice: voiceModel,
        speed,
        language
      });

      if (cache) {
        await this.cache.set(cacheKey, audioBuffer);
      }

      return {
        audio: audioBuffer.toString('base64'),
        format: format as 'mp3' | 'wav',
        duration: this.estimateDuration(text),
        fromCache: false
      };

    } catch (error: any) {
      console.error('❌ Erreur synthèse:', error.message);
      if (provider !== this.fallbackProvider) {
        return this.synthesize({ ...options, provider: this.fallbackProvider });
      }
      throw error;
    }
  }

  private getVoiceModel(language: string, provider: 'piper' | 'edge', voiceType: string): string {
    return this.voices[language]?.[provider]?.[voiceType] || 
           this.voices[language]?.[provider]?.default ||
           'default';
  }

  private generateCacheKey(text: string, options: any): string {
    const data = `${text}-${JSON.stringify(options)}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  private estimateDuration(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount / 150 * 60);
  }

  async listVoices(): Promise<VoiceInfo[]> {
    const voices: VoiceInfo[] = [];
    for (const [lang, langData] of Object.entries(this.voices)) {
      for (const [provider, providerVoices] of Object.entries(langData as Record<string, any>)) {
        for (const [voiceId, modelName] of Object.entries(providerVoices as Record<string, string>)) {
          if (voiceId !== 'default') {
            voices.push({
              id: `${provider}-${lang}-${voiceId}`,
              name: modelName as string,
              language: lang,
              gender: voiceId.includes('female') ? 'female' : 'male',
              provider: provider as string
            });
          }
        }
      }
    }
    return voices;
  }

  async checkHealth(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      try {
        status[name] = await provider.checkHealth();
      } catch {
        status[name] = false;
      }
    }
    return status;
  }
}

export default new TTSService();
