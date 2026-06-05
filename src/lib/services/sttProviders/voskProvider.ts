// lib/services/sttProviders/voskProvider.ts
import { STTOptions, STTResult } from '@/types/voice';

/**
 * VoskProvider - Désactivé temporairement à cause des contraintes de compilation native (ffi-napi).
 * Utilisation de WebSpeech API comme alternative robuste pour le prototype.
 */
class VoskProvider {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async isInitialized(): Promise<boolean> {
    return false;
  }

  async isListening(): Promise<boolean> {
    return false;
  }

  async initialize(): Promise<boolean> {
    return false;
  }

  async startListening(
    _options: STTOptions,
    _onResult: (result: STTResult) => void,
    onError: (error: string) => void
  ): Promise<void> {
    onError('Vosk non disponible dans cet environnement.');
  }

  async stopListening(): Promise<string> {
    return '';
  }

  async transcribeFile(): Promise<string> {
    throw new Error('Vosk non disponible');
  }

  getCurrentVolume(): number {
    return 0;
  }
}

export default new VoskProvider();
