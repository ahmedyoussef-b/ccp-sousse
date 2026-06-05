/**
 * @fileOverview Interface d'abstraction pour les stores vectoriels
 * @version 1.0.0
 * @description Permet de découpler la logique RAG de l'implémentation ChromaDB
 */

export interface VectorDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

export interface SearchResult {
  documents: string[];
  metadatas: Record<string, any>[];
  distances: number[];
  ids: string[];
}

export interface SearchOptions {
  nResults?: number;
  where?: Record<string, any>;
  whereDocument?: Record<string, any>;
  include?: ('documents' | 'metadatas' | 'distances' | 'embeddings')[];
}

export interface CollectionInfo {
  name: string;
  count: number;
  metadata?: Record<string, any>;
}

/**
 * Interface commune pour tous les fournisseurs de base vectorielle
 */
export interface IVectorStore {
  /**
   * Recherche des documents similaires dans une collection
   */
  search(
    collectionName: string,
    query: string | number[],
    options?: SearchOptions
  ): Promise<SearchResult>;

  /**
   * Ajoute des documents à une collection
   */
  addDocuments(
    collectionName: string,
    documents: VectorDocument[]
  ): Promise<{ success: boolean; added: number; errors?: string[] }>;

  /**
   * Récupère ou crée une collection
   */
  getOrCreateCollection(
    name: string,
    metadata?: Record<string, any>
  ): Promise<CollectionInfo>;

  /**
   * Supprime des documents par ID
   */
  deleteDocuments(
    collectionName: string,
    ids: string[]
  ): Promise<{ success: boolean; deleted: number }>;

  /**
   * Compte les documents dans une collection
   */
  count(collectionName: string): Promise<number>;

  /**
   * Liste les collections disponibles
   */
  listCollections(): Promise<CollectionInfo[]>;

  /**
   * Vérifie la connectivité au store
   */
  healthCheck(): Promise<{ ok: boolean; latency?: number; error?: string }>;
}

/**
 * Erreur spécifique au store vectoriel
 */
export class VectorStoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'VectorStoreError';
  }
}

export default IVectorStore;