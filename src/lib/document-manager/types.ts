// src/lib/document-manager/types.ts

export interface IngestionProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileName: string;
  progress: number;
  step: 'extraction' | 'chunking' | 'embedding' | 'indexing' | 'done';
  error?: string;
}

export interface SystemHealth {
  chromaDB: boolean;
  ollama: boolean;
  embeddings: boolean;
  lastCheck: string;
}

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string | Date;
  children?: FileNode[];
  zone?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  syncStatus?: 'pending' | 'syncing' | 'synced' | 'error';
  badge?: number | string;
  // Counts for images: local files on disk vs indexed entries in DB
  localCount?: number;
  indexedCount?: number;
  preparationStatus?: 'not_started' | 'processing' | 'completed' | 'failed';
  hasPreparations?: boolean;
  imageType?: 'global' | 'part' | 'simple' | 'assemblage';
}
