// types/voice.ts

export interface VoiceOptions {
  text: string;
  provider?: 'piper' | 'coqui' | 'edge';
  voice?: string;
  language?: string;
  speed?: number;
  cache?: boolean;
}

export interface VoiceResponse {
  audio: string;
  format: 'mp3' | 'wav';
  duration: number;
  fromCache: boolean;
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female';
  provider: string;
}

export interface VoiceState {
  isPlaying: boolean;
  isPaused: boolean;
  currentText: string | null;
  queue: string[];
  volume: number;
  speed: number;
  provider: string;
  voice: string;
}

export interface STTOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  model?: 'vosk' | 'whisper' | 'webspeech';
}

export interface STTResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

export interface STTState {
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  volume: number;
}

export interface VoiceInteractionState {
  isListening: boolean;
  isSpeaking: boolean;
  lastUserMessage: string | null;
  lastAIMessage: string | null;
  autoPlayResponse: boolean;
}
