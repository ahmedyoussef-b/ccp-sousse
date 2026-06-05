export interface Message {
  role: 'user' | 'ai';
  text: string;
}

export interface ChunkMetadata {
  id: string;
  docId: string;
  index: number;
  text: string;
  size: number;
}

export interface FileSystemItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  chunks?: number;
  content?: string; 
  enhancedContent?: string; // Contenu enrichi par l'apprentissage
  uploadedAt?: string;
  lastRevectorized?: string; // Date de la dernière re-vectorisation
  version?: number; // Version sémantique du document
  parentId: string | null;
  children?: FileSystemItem[];
  tags?: string[];
  graphNodes?: any[];
  hierarchy?: any;
}

export interface Stats {
  totalDocuments: number;
  totalChunks: number;
  totalSize: number;
  diskSpace: { total: string; used: string; free: string };
}
