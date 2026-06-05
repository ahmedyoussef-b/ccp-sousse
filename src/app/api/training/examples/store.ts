import * as fs from 'fs';
import * as path from 'path';
import { callGroq } from '@/ai/providers/groq-provider';
import { SQLiteCore } from '@/ai/core/sqlite';

export interface TrainingExample {
  id: string;
  question: string;
  response: string;
  quality?: number;
  tags?: string[];
  source: 'manual' | 'import' | 'feedback';
  createdAt: string;
  updatedAt?: string;
  context?: string;
  suggestedResources?: {
    images?: string[];
    mindMapNodes?: string[];
  };
}

export const TRAINING_DIR = path.join(process.cwd(), 'data', 'training');
export const CONTEXTS_DIR = path.join(TRAINING_DIR, 'contexts');
export const DEFAULT_FILE = path.join(TRAINING_DIR, 'examples.json');

// Initialize directories
if (!fs.existsSync(TRAINING_DIR)) fs.mkdirSync(TRAINING_DIR, { recursive: true });
if (!fs.existsSync(CONTEXTS_DIR)) fs.mkdirSync(CONTEXTS_DIR, { recursive: true });

export function readAllExamples(): TrainingExample[] {
  let allExamples: TrainingExample[] = [];

  // Read default legacy file
  if (fs.existsSync(DEFAULT_FILE)) {
    try {
      const data = fs.readFileSync(DEFAULT_FILE, 'utf-8');
      if (data.trim()) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) allExamples = allExamples.concat(parsed);
      }
    } catch (e) {
      console.error('Error reading legacy examples.json:', e);
    }
  }

  // Read all context files
  if (fs.existsSync(CONTEXTS_DIR)) {
    const files = fs.readdirSync(CONTEXTS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = fs.readFileSync(path.join(CONTEXTS_DIR, file), 'utf-8');
          if (data.trim()) {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) allExamples = allExamples.concat(parsed);
          }
        } catch (e) {
          console.error(`Error reading context file ${file}:`, e);
        }
      }
    }
  }

  return allExamples;
}

export function writeExample(example: TrainingExample): void {
  const contextName = example.context || 'general';
  
  // Clean context name to prevent path traversal
  const safeContextName = contextName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const filePath = path.join(CONTEXTS_DIR, `${safeContextName}.json`);

  let contextExamples: TrainingExample[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      if (data.trim()) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) contextExamples = parsed;
      }
    } catch (e) {
      console.error(`Error reading ${filePath}:`, e);
    }
  }

  const existingIndex = contextExamples.findIndex(ex => ex.id === example.id);
  if (existingIndex >= 0) {
    contextExamples[existingIndex] = example;
  } else {
    contextExamples.push(example);
  }

  fs.writeFileSync(filePath, JSON.stringify(contextExamples, null, 2));
}

export function updateExampleGlobal(exampleId: string, updates: Partial<TrainingExample>): TrainingExample | null {
  // Try legacy file first
  if (fs.existsSync(DEFAULT_FILE)) {
    try {
      const data = fs.readFileSync(DEFAULT_FILE, 'utf-8');
      if (data.trim()) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          const idx = parsed.findIndex((ex: TrainingExample) => ex.id === exampleId);
          if (idx >= 0) {
            const updatedEx = { ...parsed[idx], ...updates, updatedAt: new Date().toISOString() };
            parsed[idx] = updatedEx;
            fs.writeFileSync(DEFAULT_FILE, JSON.stringify(parsed, null, 2));
            return updatedEx;
          }
        }
      }
    } catch (e) {
       console.error(e);
    }
  }

  // Then try context files
  if (fs.existsSync(CONTEXTS_DIR)) {
    const files = fs.readdirSync(CONTEXTS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(CONTEXTS_DIR, file);
        try {
          const data = fs.readFileSync(filePath, 'utf-8');
          if (data.trim()) {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
              const idx = parsed.findIndex((ex: TrainingExample) => ex.id === exampleId);
              if (idx >= 0) {
                const updatedEx = { ...parsed[idx], ...updates, updatedAt: new Date().toISOString() };
                parsed[idx] = updatedEx;
                fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));
                return updatedEx;
              }
            }
          }
        } catch (e) {
           console.error(e);
        }
      }
    }
  }

  return null;
}

export function deleteExampleGlobal(exampleId: string): boolean {
  let deleted = false;

  // Try legacy file
  if (fs.existsSync(DEFAULT_FILE)) {
    try {
      const data = fs.readFileSync(DEFAULT_FILE, 'utf-8');
      if (data.trim()) {
        const parsed = JSON.parse(data) as TrainingExample[];
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(ex => ex.id !== exampleId);
          if (filtered.length !== parsed.length) {
            fs.writeFileSync(DEFAULT_FILE, JSON.stringify(filtered, null, 2));
            deleted = true;
          }
        }
      }
    } catch (e) { console.error(e); }
  }

  // Try context files
  if (fs.existsSync(CONTEXTS_DIR)) {
    const files = fs.readdirSync(CONTEXTS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(CONTEXTS_DIR, file);
        try {
          const data = fs.readFileSync(filePath, 'utf-8');
          if (data.trim()) {
            const parsed = JSON.parse(data) as TrainingExample[];
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter(ex => ex.id !== exampleId);
              if (filtered.length !== parsed.length) {
                fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2));
                deleted = true;
              }
            }
          }
        } catch (e) { console.error(e); }
      }
    }
  }

  return deleted;
}

export function deleteAllExamples(): void {
  if (fs.existsSync(DEFAULT_FILE)) {
    fs.writeFileSync(DEFAULT_FILE, JSON.stringify([], null, 2));
  }
  if (fs.existsSync(CONTEXTS_DIR)) {
    const files = fs.readdirSync(CONTEXTS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(CONTEXTS_DIR, file));
      }
    }
  }
}

export async function analyzeContextAndLinks(question: string, response: string) {
  let contextOptions = "turbine_vapeur, poste_eau, chimie_eau, chaudiere, electrique, ou general";
  
  try {
    const db = SQLiteCore.getInstance();
    await db.initialize();
    const circuits = db.reference.getCircuits();
    if (circuits && circuits.length > 0) {
      const circuitNames = circuits.map((c: any) => c.name).join(', ');
      contextOptions = `${circuitNames}, general`;
    }
  } catch (err) {
    console.error('Failed to fetch circuits from DB for LLM prompt', err);
  }

  const prompt = `En tant qu'expert industriel, analyse la Q/R suivante pour l'assigner à un circuit précis. 
Détermine la catégorie "context" EN CHOISISSANT OBLIGATOIREMENT un nom exact parmi cette liste issue de notre Bibliothèque d'IDs Structurés :
[${contextOptions}].

Propose aussi des mots clés pertinents pour chercher des schémas/images liés, et identifie les tags/ID (ex: LCV001, Condenseur) correspondants dans les BDD (Mind Map, bibliothèque d'IDs).

Réponds UNIQUEMENT un objet JSON valide et strict avec ce format :
{"context": "nom_exact_du_circuit", "imagesKeywords": ["mot1", "mot2"], "mindMapNodes": ["nodeID"]}

Question: ${question}
Réponse: ${response}`;

  try {
    const aiResult = await callGroq(prompt, {
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      maxTokens: 300
    });
    
    let text = aiResult;
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx >= 0 && endIdx >= startIdx) {
      return JSON.parse(text.substring(startIdx, endIdx + 1));
    }
    return null;
  } catch(e) {
    console.error('LLM contextualization failed:', e);
    return null;
  }
}
