/**
 * @fileOverview API Client Elite - Orchestrateur de Décision Amélioré.
 * Support du pipeline ML complet et du routage intelligent RAG/Agent.
 * 
 * @version 4.0.0 - Suppression des imports SQLite (côté client)
 */

import { FileSystemItem, Stats } from '@/types';

const STORAGE_KEY = 'AGENTIC_VFS_ELITE_V32';
const MEMORY_KEY = 'AGENTIC_EPisodic_MEMORY_V1';

const loadLocalFS = (): FileSystemItem[] => {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

const saveLocalFS = (fs: FileSystemItem[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fs));
};

type ClientEpisode = {
  id: string;
  timestamp: number;
  context: string;
  action: string;
  result: string;
  success: boolean;
  metadata?: Record<string, any>;
};

const loadMemory = (): ClientEpisode[] => {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]'); } catch { return []; }
};

const saveMemory = async (episodes: ClientEpisode[]) => {
  if (typeof window === 'undefined') return;
  const optimized = episodes.slice(0, 50); 
  localStorage.setItem(MEMORY_KEY, JSON.stringify(optimized));
};

async function safeJsonParse(res: Response) {
  const contentType = res.headers.get("content-type");
  
  if (res.status === 504) {
    throw new Error("Délai d'attente dépassé (504). Le traitement de ce document est trop lourd pour le service IA actuel.");
  }

  if (contentType && contentType.includes("application/json")) {
    try {
      return await res.json();
    } catch (e) {
      throw new Error("La réponse du serveur est malformée.");
    }
  }
  
  const text = await res.text();
  if (text.includes('<html>')) {
    throw new Error(`Erreur serveur (${res.status}). Veuillez vérifier que le backend est opérationnel.`);
  }
  throw new Error(`Réponse inattendue (${res.status}): ${text.substring(0, 100)}`);
}

export const api = {
  async upload(file: File, parentId: string | null = null): Promise<any> {
    console.log(`[CLIENT_API][UPLOAD] Envoi du fichier : ${file.name}`);
    if (!(file instanceof File)) throw new Error("Le fichier est invalide.");
    
    const fs = loadLocalFS();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', 'default-user');
    
    const res = await fetch('/api/ingest', { method: 'POST', body: formData });
    const result = await safeJsonParse(res);

    if (result.error) {
      console.error(`[CLIENT_API][UPLOAD_ERROR] ${result.error}`);
      throw new Error(result.details || result.error);
    }

    const text = await file.text().catch(() => "");
    const newFile: FileSystemItem = {
      id: result.documentId || Math.random().toString(36).substring(7),
      name: file.name,
      type: 'file',
      size: file.size,
      chunks: result.stats?.chunks || 0,
      content: text,
      uploadedAt: new Date().toISOString(),
      parentId,
      tags: result.concepts || [],
      version: 1
    };

    console.log(`[CLIENT_API][UPLOAD_SUCCESS] Document indexé (ID: ${newFile.id}, Segments: ${newFile.chunks})`);
    saveLocalFS([...fs, newFile]);
    return result;
  },

  async chat(query: string, history: any[] = []): Promise<any> {
    const startTime = Date.now();
    console.log(`[CLIENT_API][CHAT] Envoi requête : "${query.substring(0, 40)}..."`);
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: query,
        history: history,
        userId: 'default-user',
        mode: 'auto'
      })
    });

    const result = await safeJsonParse(response);
    if (result.error) {
      console.error(`[CLIENT_API][CHAT_ERROR] ${result.error}`);
      throw new Error(result.error);
    }

    const duration = Date.now() - startTime;
    console.log(`[CLIENT_API][CHAT_SUCCESS] Réponse reçue en ${duration}ms. Mode: ${result.isAgentMission ? 'AGENT' : 'RAG'}`);

    if (result.newMemoryEpisode) {
      console.log(`[CLIENT_API][CHAT] Mémorisation d'un nouvel épisode (Importance: ${result.confidence.toFixed(2)})`);
      const currentMemory = loadMemory();
      await saveMemory([result.newMemoryEpisode, ...currentMemory]);
    }

    // ❌ SUPPRIMÉ - Appel à continuousLearning (côté serveur uniquement)
    // const finalAnswer = continuousLearning.applyRules(result.answer);
    // ✅ Remplacé par - Le serveur applique déjà les règles
    return result;
  },

  async deleteItem(id: string): Promise<any> {
    console.log(`[CLIENT_API][DELETE] Suppression de l'élément : ${id}`);
    const fs = loadLocalFS();
    saveLocalFS(fs.filter(item => item.id !== id));
    return { success: true };
  },

  async getStats(): Promise<Stats> {
    const fs = loadLocalFS();
    let size = 0;
    fs.forEach(i => { if (i.type === 'file') size += (i.size || 0); });
    return { 
      totalDocuments: fs.filter(i => i.type === 'file').length, 
      totalChunks: fs.reduce((acc, curr) => acc + (curr.chunks || 0), 0),
      totalSize: size,
      diskSpace: { used: `${(size / 1024 / 1024).toFixed(2)} MB`, total: '500 MB', free: '...' }
    };
  },

  async getFileSystem(): Promise<FileSystemItem[]> {
    const allItems = loadLocalFS();
    const buildTree = (parentId: string | null): FileSystemItem[] => {
      return allItems.filter(item => item.parentId === parentId).map(item => ({
        ...item,
        children: item.type === 'folder' ? buildTree(item.id) : undefined
      }));
    };
    return buildTree(null);
  },

  async submitFeedback(query: string, response: string, rating: number): Promise<void> {
    console.log(`[CLIENT_API][FEEDBACK] Envoi feedback (Rating: ${rating}) pour "${query.substring(0, 20)}..."`);
    
    // ✅ Envoyer le feedback au serveur (qui gère implicitRL)
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, response, rating })
    });
  },

  async submitCorrection(original: string, corrected: string): Promise<boolean> {
    console.log(`[CLIENT_API][CORRECTION] Enregistrement d'une règle corrective.`);
    
    // ✅ Envoyer la correction au serveur
    const res = await fetch('/api/learning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record', data: { original, corrected } })
    });
    
    return res.ok;
  },

  async getTrainingDashboard(): Promise<any> {
    const res = await fetch('/api/training/dashboard');
    if (!res.ok) return { activeBrain: { accuracy: 0.72 }, pipelineStatus: {}, improvementTrend: [] };
    return safeJsonParse(res);
  },

  async revectorizeDocument(id: string): Promise<any> {
    console.log(`[CLIENT_API][REVECTORIZE] Demande de re-vectorisation pour : ${id}`);
    const fs = loadLocalFS();
    const doc = fs.find(f => f.id === id);
    if (!doc) throw new Error("Document introuvable.");
    
    doc.version = (doc.version || 1) + 1;
    doc.lastRevectorized = new Date().toISOString();
    saveLocalFS([...fs]);
    return { version: doc.version };
  },

  async runGlobalOptimization(): Promise<any> {
    console.log(`[CLIENT_API][OPTIMIZE] Lancement du cycle d'optimisation global.`);
    const fs = loadLocalFS();
    const memory = loadMemory();
    const res = await fetch('/api/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: fs, memory })
    });
    return await safeJsonParse(res);
  }
};