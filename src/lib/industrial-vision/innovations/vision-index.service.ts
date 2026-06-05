// src/lib/industrial-vision/innovations/vision-index.service.ts
//
// Service d'indexation réel pour Innovation #1 — Indexation texte → Localisation
// Construit et interroge un index persistant des organes depuis la banque d'images.
// Utilise Ollama LLM pour extraire les organes d'une image (description textuelle).

import fs from 'fs';
import path from 'path';
import { callOllama } from '@/ai/providers/ollama-client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OrganeIndex {
  nom: string;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  centreX: number;
  centreY: number;
  largeur: number;
  hauteur: number;
  confiance: number;
  imagePath: string;
  imageFilename: string;
  imageId: string;
  imageDescription: string;
  imageTags: string[];
  imageFolder: string;
  indexedAt: string;
  methode: 'analysis_json' | 'ollama_vision' | 'metadata';
}

export interface VisionIndex {
  version: string;
  lastUpdated: string;
  imageCount: number;
  organeCount: number;
  organes: OrganeIndex[];
}

export interface LocalisationResult {
  found: boolean;
  organe?: string;
  queryNormalized: string;
  matchType: 'exact' | 'partial' | 'fuzzy' | 'llm';
  resultats: Array<{
    imagePath: string;
    imageFilename: string;
    imageDescription: string;
    imageFolder: string;
    organeNom: string;
    bbox: [number, number, number, number];
    centreX: number;
    centreY: number;
    largeur: number;
    hauteur: number;
    confiance: number;
    methode: string;
  }>;
  indexStats: {
    imagesIndexees: number;
    organesIndexes: number;
    lastUpdated: string;
  };
}

// ─── Chemins ───────────────────────────────────────────────────────────────────

const BANQUE_PATH = path.join(process.cwd(), 'data', 'banque_images_ia');
const INDEX_PATH = path.join(process.cwd(), 'data', 'vision-index.json');

// ─── Normalisation texte ──────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityScore(query: string, target: string): number {
  const q = normalizeText(query);
  const t = normalizeText(target);
  if (t === q) return 1.0;
  if (t.includes(q) || q.includes(t)) return 0.9;
  const qWords = q.split(' ');
  const tWords = t.split(' ');
  const matchedWords = qWords.filter(w => w.length > 2 && tWords.some(tw => tw.includes(w) || w.includes(tw)));
  return matchedWords.length / Math.max(qWords.length, 1);
}

// ─── Lecture des metadata réelles ────────────────────────────────────────────

interface ImageMetadata {
  id: string;
  filename: string;
  description: string;
  tags: string[];
  location?: string;
  folderId?: string;
  targetPath?: string;
  features?: number[];
}

function loadAllImages(): Array<{ imagePath: string; metadata: ImageMetadata; analysisPath: string | null }> {
  const results: Array<{ imagePath: string; metadata: ImageMetadata; analysisPath: string | null }> = [];
  if (!fs.existsSync(BANQUE_PATH)) return results;

  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      // Fichiers image non-thumb avec un .json associé
      if (/\.(jpg|jpeg|png)$/i.test(f) && !f.includes('_thumb')) {
        const baseName = f.replace(/\.(jpg|jpeg|png)$/i, '');
        const jsonPath = path.join(dir, `${baseName}.json`);
        const analysisPath = path.join(dir, `${baseName}.analysis.json`);
        if (fs.existsSync(jsonPath)) {
          try {
            const metadata: ImageMetadata = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            results.push({
              imagePath: full,
              metadata,
              analysisPath: fs.existsSync(analysisPath) ? analysisPath : null
            });
          } catch { /* skip */ }
        }
      }
    }
  };
  walk(BANQUE_PATH);
  return results;
}

// ─── Extraction organes via Ollama (vision textuelle) ─────────────────────────

async function extractOrganesWithOllama(imagePath: string, metadata: ImageMetadata): Promise<OrganeIndex[]> {
  const folderParts = imagePath.replace(BANQUE_PATH, '').split(path.sep).filter(Boolean);
  const folderContext = folderParts.slice(0, -1).join(' > ');

  const prompt = `Tu es un expert en vision industrielle spécialisé dans les schémas P&ID et les tableaux de contrôle.

Image à analyser :
- Nom du fichier : ${metadata.filename}
- Description : ${metadata.description}
- Tags : ${metadata.tags.join(', ')}
- Localisation : ${folderContext}

En te basant sur ces informations (nom de fichier, description, tags, localisation dans la banque d'images), identifie les organes industriels probablement présents dans cette image.

Réponds UNIQUEMENT au format JSON strict, rien d'autre :
{
  "organes": [
    {"nom": "NOM_ORGANE", "x1": 100, "y1": 150, "x2": 300, "y2": 200, "confiance": 0.85},
    {"nom": "AUTRE_ORGANE", "x1": 350, "y1": 80, "x2": 500, "y2": 130, "confiance": 0.78}
  ]
}

Les organes industriels typiques sont : CONDENSEUR, CIRCUIT HP, CIRCUIT BP, BALLON PURGES, ATM, POMPE, VANNE, TURBINE, ALTERNATEUR, CHAUDIERE, ECHANGEUR, COMPRESSEUR, FILTRE, SOUPAPE, MANOMETRE, THERMOMETRE.
Estime les positions bbox dans une image standard 800x600.`;

  try {
    const response = await callOllama(prompt, {
      maxTokens: 600,
      temperature: 0.2,
      model: 'gemma2:2b'
    });

    // Extraction du JSON de la réponse
    const jsonMatch = response.match(/\{[\s\S]*"organes"[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.organes)) return [];

    return parsed.organes.map((o: any) => {
      const x1 = Math.max(0, Math.round(o.x1 || 0));
      const y1 = Math.max(0, Math.round(o.y1 || 0));
      const x2 = Math.max(x1 + 10, Math.round(o.x2 || x1 + 100));
      const y2 = Math.max(y1 + 10, Math.round(o.y2 || y1 + 50));
      return {
        nom: String(o.nom || '').toUpperCase().trim(),
        bbox: [x1, y1, x2, y2] as [number, number, number, number],
        centreX: Math.round((x1 + x2) / 2),
        centreY: Math.round((y1 + y2) / 2),
        largeur: x2 - x1,
        hauteur: y2 - y1,
        confiance: Math.min(1, Math.max(0, Number(o.confiance) || 0.7)),
        imagePath,
        imageFilename: metadata.filename,
        imageId: metadata.id,
        imageDescription: metadata.description,
        imageTags: metadata.tags,
        imageFolder: folderContext,
        indexedAt: new Date().toISOString(),
        methode: 'ollama_vision' as const
      };
    }).filter((o: OrganeIndex) => o.nom.length > 0);
  } catch {
    return [];
  }
}

// ─── Extraction organes depuis analysis.json ──────────────────────────────────

function extractOrganesFromAnalysis(
  analysisPath: string,
  imagePath: string,
  metadata: ImageMetadata
): OrganeIndex[] {
  try {
    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
    if (!Array.isArray(analysis.organes)) return [];
    const folderParts = imagePath.replace(BANQUE_PATH, '').split(path.sep).filter(Boolean);
    const folderContext = folderParts.slice(0, -1).join(' > ');

    return analysis.organes.map((o: any) => {
      const [x1, y1, x2, y2] = o.bbox || [0, 0, 100, 50];
      return {
        nom: String(o.nom || '').toUpperCase().trim(),
        bbox: [x1, y1, x2, y2] as [number, number, number, number],
        centreX: Math.round((x1 + x2) / 2),
        centreY: Math.round((y1 + y2) / 2),
        largeur: x2 - x1,
        hauteur: y2 - y1,
        confiance: Number(o.confiance) || 0.9,
        imagePath,
        imageFilename: metadata.filename,
        imageId: metadata.id,
        imageDescription: metadata.description,
        imageTags: metadata.tags,
        imageFolder: folderContext,
        indexedAt: new Date().toISOString(),
        methode: 'analysis_json' as const
      };
    });
  } catch {
    return [];
  }
}

// ─── Build / Refresh de l'index ───────────────────────────────────────────────

export async function buildVisionIndex(forceRebuild = false): Promise<VisionIndex> {
  // Si l'index existe et n'est pas forcé, le retourner
  if (!forceRebuild && fs.existsSync(INDEX_PATH)) {
    try {
      const existing: VisionIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
      // Index valide si moins de 24h
      const age = Date.now() - new Date(existing.lastUpdated).getTime();
      if (age < 24 * 60 * 60 * 1000 && existing.organeCount > 0) {
        return existing;
      }
    } catch { /* rebuild */ }
  }

  const images = loadAllImages();
  const allOrganes: OrganeIndex[] = [];

  for (const { imagePath, metadata, analysisPath } of images) {
    let organes: OrganeIndex[] = [];

    if (analysisPath) {
      // Préférer l'analysis.json existant
      organes = extractOrganesFromAnalysis(analysisPath, imagePath, metadata);
    }

    if (organes.length === 0) {
      // Fallback Ollama pour les images sans analysis
      organes = await extractOrganesWithOllama(imagePath, metadata);
    }

    allOrganes.push(...organes);
  }

  const index: VisionIndex = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    imageCount: images.length,
    organeCount: allOrganes.length,
    organes: allOrganes
  };

  // Sauvegarder l'index
  try {
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  } catch { /* ignore write error */ }

  return index;
}

// ─── Recherche dans l'index ───────────────────────────────────────────────────

export async function localiserOrgane(query: string): Promise<LocalisationResult> {
  const index = await buildVisionIndex();
  const queryNorm = normalizeText(query);

  // Recherche par score de similarité
  const scored = index.organes.map(o => ({
    ...o,
    score: similarityScore(query, o.nom)
  }));

  // Filtrer les pertinents (score > 0.5)
  const pertinents = scored
    .filter(o => o.score > 0.5)
    .sort((a, b) => b.score - a.score);

  if (pertinents.length > 0) {
    const topScore = pertinents[0].score;
    const matchType = topScore >= 1.0 ? 'exact' : topScore >= 0.9 ? 'partial' : 'fuzzy';
    // Regrouper par image unique (top 5)
    const seen = new Set<string>();
    const deduped = pertinents.filter(o => {
      const key = `${o.imagePath}:${o.nom}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);

    return {
      found: true,
      organe: pertinents[0].nom,
      queryNormalized: queryNorm,
      matchType,
      resultats: deduped.map(o => ({
        imagePath: o.imagePath,
        imageFilename: o.imageFilename,
        imageDescription: o.imageDescription,
        imageFolder: o.imageFolder,
        organeNom: o.nom,
        bbox: o.bbox,
        centreX: o.centreX,
        centreY: o.centreY,
        largeur: o.largeur,
        hauteur: o.hauteur,
        confiance: o.confiance,
        methode: o.methode
      })),
      indexStats: {
        imagesIndexees: index.imageCount,
        organesIndexes: index.organeCount,
        lastUpdated: index.lastUpdated
      }
    };
  }

  return {
    found: false,
    queryNormalized: queryNorm,
    matchType: 'llm',
    resultats: [],
    indexStats: {
      imagesIndexees: index.imageCount,
      organesIndexes: index.organeCount,
      lastUpdated: index.lastUpdated
    }
  };
}

/**
 * Localise un organe dans une image spécifique (utile pour l'upload direct)
 */
export async function localiserDansImageSpecifique(
  query: string, 
  imagePath: string
): Promise<LocalisationResult> {
  const queryNorm = normalizeText(query);
  
  // 1. Extraire les organes de cette image spécifique
  // On crée des metadata fictives
  const metadata: ImageMetadata = {
    id: path.basename(imagePath),
    filename: path.basename(imagePath),
    description: "Image chargée par l'utilisateur pour analyse contextuelle",
    tags: ["context-upload"]
  };

  // On vérifie s'il y a un .analysis.json
  const analysisPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '.analysis.json');
  let organes: OrganeIndex[] = [];
  
  if (fs.existsSync(analysisPath)) {
    organes = extractOrganesFromAnalysis(analysisPath, imagePath, metadata);
  } else {
    organes = await extractOrganesWithOllama(imagePath, metadata);
  }

  // 2. Chercher dans ces organes
  const scored = organes.map(o => ({
    ...o,
    score: similarityScore(query, o.nom)
  }));

  const pertinents = scored
    .filter(o => o.score > 0.4) // Seuil plus bas pour l'analyse spécifique
    .sort((a, b) => b.score - a.score);

  return {
    found: pertinents.length > 0,
    organe: pertinents.length > 0 ? pertinents[0].nom : undefined,
    queryNormalized: queryNorm,
    matchType: 'exact',
    resultats: pertinents.map(o => ({
      imagePath: o.imagePath,
      imageFilename: o.imageFilename,
      imageDescription: o.imageDescription,
      imageFolder: o.imageFolder,
      organeNom: o.nom,
      bbox: o.bbox,
      centreX: o.centreX,
      centreY: o.centreY,
      largeur: o.largeur,
      hauteur: o.hauteur,
      confiance: o.confiance,
      methode: o.methode
    })),
    indexStats: {
      imagesIndexees: 1,
      organesIndexes: organes.length,
      lastUpdated: new Date().toISOString()
    }
  };
}

// ─── Lister tous les organes de l'index ──────────────────────────────────────

export async function listerTousOrganes(): Promise<{
  organes: string[];
  parImage: Array<{ image: string; description: string; organes: string[] }>;
  stats: { images: number; organes: number; lastUpdated: string };
}> {
  const index = await buildVisionIndex();
  const uniqueOrganes = [...new Set(index.organes.map(o => o.nom))].sort();

  const parImage: Array<{ image: string; description: string; organes: string[] }> = [];
  const imagesMap = new Map<string, { description: string; organes: Set<string> }>();

  for (const o of index.organes) {
    if (!imagesMap.has(o.imagePath)) {
      imagesMap.set(o.imagePath, { description: o.imageDescription, organes: new Set() });
    }
    imagesMap.get(o.imagePath)!.organes.add(o.nom);
  }

  for (const [imgPath, data] of imagesMap) {
    parImage.push({
      image: path.basename(imgPath),
      description: data.description,
      organes: [...data.organes].sort()
    });
  }

  return {
    organes: uniqueOrganes,
    parImage,
    stats: { images: index.imageCount, organes: index.organeCount, lastUpdated: index.lastUpdated }
  };
}
