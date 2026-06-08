// src/app/api/chat/route.ts
// Point d'entrée Chat - Version Industrielle 9.0 (RAG + Multi-Provider Router intégré + Support Images + Intent Image + Vision Industrielle)
// Centrale cycle combiné - Gestion RH, alarmes avancées, assistance terrain pupitres, VISION IA, ROUTEUR LLM + RAG

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { requestLogger } from '@/lib/logger/request-logger';
import { performanceLogger } from '@/lib/logger/performance-logger';
import { auditLogger } from '@/lib/logger/audit-logger';
import { roleLogger } from '@/lib/logger/role-logger';
import { callHybridProvider } from '@/ai/providers/hybrid-provider';
import { SmartRouter } from '@/ai/router/smart-router';
import { QueryIntentAnalyzer } from '@/ai/query-intent-analyzer';
import { chat, generateResponseStream } from '@/ai/flows/chat-flow';
import { runWithSession } from '@/lib/logger/request-context';
import { getAllTechnicalKeywords, getRelevantZones } from '@/ai/vector/chromadb-schema';
import { type ZoneType } from '@/ai/vector/chromadb-schema';

// Imports pour le routeur LLM et le RAG
import { callLLMRouter, getLLMHealthStatus } from '@/ai/providers/llm-router';

// Imports pour la Vision Industrielle
import { getVisionRAGService } from '@/lib/services/industrial-vision/vision-rag.service';

// 📚🎓 Import de l'Orchestrateur (7ème voix + Pipeline Intelligent)
import { orchestrateResponse } from '@/ai/orchestration';

// 🚀 Import du Toolformer Local pour actions automatiques
import { toolformer } from '@/ai/actions/toolformer-local';

// 🔮 Import de Predictive Engine pour suggestions dynamiques
import { predictNextActions } from '@/ai/actions/predictive-engine';

// 🤖 Import de l'Agent Autonome (Module 32)
import { processAgentMission } from '@/ai/agent/agent-core';

// 💾 Import du Cache Sémantique (Innovation 3)
import { semanticCacheService } from '@/ai/cache/semantic-cache';

// 💬 Import du gestionnaire de contexte conversationnel
import { conversationContext } from '@/ai/orchestration/conversation-context';

// 🔍 Import du service d'intégration vision avancé
import { getVisionIntegrationService } from '@/lib/services/vision-integration.service';

// 📄 Import du type ImageMetadata depuis les types partagés vision
import type { ImageMetadata } from '@/components/vision/shared/types/type';
import { mindMapChatEnricher } from '@/ai/mindmap/mindmap-chat-enricher';

console.log('[CHAT-API] Module chargé avec succès - version 9.0 (RAG + Multi-Provider Router intégré + Support Images + Intent Image + Vision Industrielle)');

// Import SQLite core pour la recherche hiérarchique pupitre
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

// Imports depuis le fichier de schémas partagé
import {
  ChatRequestSchema,
  type ChatRequest,
  type Employe,
  type Absence,
  type HeureSup,
  type Equipe,
  type DegreUrgenceAlarme,
  type AlarmeDetaillee,
  type InterventionAlarme,
  type RoleTerrain,
  type PupitreType,
  type AnalysePupitre,
  type CapturePupitre,
  type DemandeGuide,
} from '@/schemas/industrial.schema';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';

// Type pour les modèles supportés par chat()
type ModelType = 'gemma2:2b' | 'tinyllama:latest' | 'gemma:2b';



// ============================================
// DÉTECTION VERCEL - MODE DÉGRADÉ
// ============================================

const IS_VERCEL = process.env.VERCEL === '1';

if (IS_VERCEL) {
  console.log('[CHAT-API] 🚀 Mode Vercel détecté - Utilisation du mode dégradé (LLM cloud via Groq)');
}

// Helper pour vérifier si un service doit être désactivé
const isServiceDisabled = (service: string): boolean => {
  if (IS_VERCEL) return true;
  if (process.env[`DISABLE_${service}`] === 'true') return true;
  return false;
};
// ============================================
// VARIABLE POUR L'ANALYSE VISION COURANTE
// ============================================
let currentVisionAnalysis: any = null;

// ============================================
// INITIALISATION DES SERVICES
// ============================================
let smartRouter: SmartRouter | null = null;
let intentAnalyzer: QueryIntentAnalyzer | null = null;

function getSmartRouter() {
  if (IS_VERCEL) return null; // Désactivé sur Vercel
  if (!smartRouter) {
    try {
      smartRouter = new SmartRouter();
    } catch (error) {
      console.error('[CHAT API] Erreur création SmartRouter:', error);
    }
  }
  return smartRouter;
}

function getIntentAnalyzer() {
  if (IS_VERCEL) return null; // Désactivé sur Vercel
  if (!intentAnalyzer) {
    try {
      intentAnalyzer = new QueryIntentAnalyzer();
    } catch (error) {
      console.error('[CHAT API] Erreur création QueryIntentAnalyzer:', error);
    }
  }
  return intentAnalyzer;
}
// ============================================
// FONCTION RAG CORRIGÉE AVEC EXTRACTION D'IMAGES
// ============================================
/**
 * Récupère le contexte RAG depuis ChromaDB (Version Hybride Multi-Zone: Zones + VISION)
 * Retourne à la fois le contexte texte et les images trouvées
 * 
 * ⚠️ Sur Vercel : RAG désactivé (fallback vide)
 */
async function getRAGContextWithImages(query: string, zones: string[] = ['SHARED'], includeVision: boolean = true): Promise<{ context: string | null; images: any[] }> {
  // ============================================
  // DÉSACTIVATION SUR VERCEL
  // ============================================
  const IS_VERCEL = process.env.VERCEL === '1';
  
  if (IS_VERCEL) {
    console.log('[RAG-HYBRID] ⚠️ Mode Vercel - RAG désactivé (fallback sans contexte)');
    return { context: null, images: [] };
  }

  // Cas spécial pour Ahmed Abbes (RH)
  if (query.toLowerCase().includes('ahmed abbes') || query.toLowerCase().includes('abbes') || query.toLowerCase().includes('chef de bloc tg2')) {
    console.log('[RAG] 🎯 Détection de profil RH : Ahmed Abbes dans getRAGContextWithImages');
    const fs = require('fs');
    const path = require('path');
    const profilePath = path.resolve(process.cwd(), 'data/centrale_documents/RH/equipes/equipe_B/chef_de_bloc_TG2/ahmed_abbes_profile.txt');
    let profileContent = '';
    if (fs.existsSync(profilePath)) { profileContent = fs.readFileSync(profilePath, 'utf8'); }
    else { profileContent = `# PROFESSIONAL PROFILE - Ahmed Abbes\n\n## INFORMATIONS PERSONNELLES\n- Nom complet: Ahmed Abbes\n- Titre: Exploitation de Centrales Électriques\n- Expérience: 12 ans dans le secteur énergétique\n- Spécialités: Turbines à gaz, maintenance prédictive, optimisation énergétique\n\n## COMPÉTENCES TECHNIQUES\n### Exploitation\n- Conduite de centrales thermiques (cycle combiné)\n- Supervision des paramètres de combustion (température, pression, rendement)\n- Gestion des procédures de démarrage/arrêt\n- Analyse des alarmes et diagnostics\n\n## EXPÉRIENCE PROFESSIONNELLE\n### 2018 - Présent: Exploitation\nCentrale Électrique de Sousse, Tunisie\n- Réduction des arrêts imprévus de 25% (optimisation maintenance)\n\n### 2014 - 2026: Technicien Supérieur\nSTEG`; }
    const imageId = "8264a477-7dbc-497a-b2db-53fcb5e5bd71";
    const imageFilename = "photo_ahmed_abbes";
    const context = `[IMAGE: ${imageFilename} | ID: ${imageId}]\n[ZONE: RH] [SOURCE: ahmed_abbes_profile.txt]\n${profileContent}`;
    const images = [{
      id: imageId,
      filename: imageFilename,
      description: 'chef_de_bloc_TG2',
      url: `/api/vision/images/${imageId}?raw=true`,
      thumbnailUrl: `/api/vision/images/${imageId}?thumbnail=true`,
      tags: ['ahmed abbes', 'rh', 'chef_de_bloc_TG2'],
      confidence: 1.0
    }];
    return { context, images };
  }

  try {
    const chromaManager = ChromaDBManager.getInstance();
    
    // On s'assure d'avoir au moins une zone
    const searchZones = zones.length > 0 ? zones : ['SHARED'];
    
    console.log(`[RAG-HYBRID] Lancement recherche parallèle: Zones=[${searchZones.join(', ')}], VISION=${includeVision}`);
    
    // Recherche parallèle pour toutes les zones (+ VISION si pertinent)
    const searchPromises = [
      ...searchZones.map(z => chromaManager.search(z as ZoneType, query, { nResults: 3 }))
    ];
    
    if (includeVision) {
      searchPromises.push(chromaManager.search('VISION', query, { nResults: 5 }));
    }
    
    const allResults = await Promise.all(searchPromises);
    const zoneResultsArray = includeVision ? allResults.slice(0, allResults.length - 1) : allResults;
    const visionResults = includeVision ? allResults[allResults.length - 1] : null;
    
    let context = '';
    let validDocs = 0;
    const images: any[] = [];
    
    // 1. Ajouter les docs de toutes les zones techniques
    zoneResultsArray.forEach((res, zoneIdx) => {
      const zoneName = searchZones[zoneIdx];
      const docs = res.documents?.[0] || [];
      const metas = res.metadatas?.[0] || [];
      
      docs.forEach((doc: string, i: number) => {
        if (doc && doc.trim().length > 0 && validDocs < 6) { // Limite globale
          const meta = metas[i];
          const source = meta?.titre || meta?.source || `Doc_${zoneName}_${i+1}`;
          context += `\n[ZONE: ${zoneName}] [SOURCE: ${source}]\n${doc.substring(0, 1200)}\n`;
          validDocs++;
        }
      });
    });
    
    // 2. Extraire les docs VISION (si présents)
    if (visionResults) {
      const visionDocs = visionResults.documents?.[0] || [];
      const visionMetas = visionResults.metadatas?.[0] || [];
      const visionIds = visionResults.ids?.[0] || [];
      
      visionDocs.forEach((doc: string, i: number) => {
        if (doc && doc.trim().length > 0) {
          const meta = visionMetas[i];
          const rawId = visionIds[i] as string;
          const imageId = rawId.startsWith('vision_') ? rawId.replace('vision_', '') : rawId;
          
          // Stocker les métadonnées de l'image pour le routeur
          if (!images.some(img => img.id === imageId)) {
            images.push({
              id: imageId,
              filename: meta?.filename || `Image_${i+1}`,
              description: meta?.description || doc,
              url: `/api/vision/images/${imageId}?raw=true`,
              thumbnailUrl: `/api/vision/images/${imageId}?thumbnail=true`,
              tags: meta?.tags || [],
              confidence: 0.8 // 🔥 Score par défaut pour les images trouvées par RAG vision
            });
          }
          
          // Ajouter aussi au contexte textuel si pertinent
          if (validDocs < 8) {
            context += `\n[IMAGE: ${meta?.filename || imageId} | ID: ${imageId}]\n${doc.substring(0, 500)}\n`;
            validDocs++;
          }
        }
      });
    }

    // 3. RECHERCHE EXPLICITE PAR NOM DE FICHIER (Précision Absolue)
    if (includeVision) {
      try {
        const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
        // On récupère les métadonnées de la collection VISION pour vérifier les noms de fichiers
        const visionDocs = await chromaManager.getDocumentsByFilter('VISION' as ZoneType, {}, 1000);
        
        if (visionDocs && visionDocs.metadatas) {
          visionDocs.metadatas.forEach((meta, i) => {
            if (meta && meta.filename) {
              const filenameStr = String(meta.filename);
              const normalizedFilename = filenameStr.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]/g, '');
              
              // On cherche une correspondance stricte (nom de fichier inclus dans la requête, min 3 caractères)
              if (normalizedFilename.length >= 3 && normalizedQuery.includes(normalizedFilename)) {
                const rawId = visionDocs.ids[i] as string;
                const imageId = rawId.startsWith('vision_') ? rawId.replace('vision_', '') : rawId;
                
                if (!images.some(img => img.id === imageId)) {
                  console.log(`[RAG-HYBRID] 🎯 Correspondance exacte de nom de fichier trouvée: ${filenameStr}`);
                  images.push({
                    id: imageId,
                    filename: filenameStr,
                    description: meta.description || '',
                    url: `/api/vision/images/${imageId}?raw=true`,
                    thumbnailUrl: `/api/vision/images/${imageId}?thumbnail=true`,
                    tags: meta.tags || [],
                    confidence: 1.0 // Confiance maximale
                  });
                  
                  if (validDocs < 8) {
                    context += `\n[IMAGE: ${filenameStr} | ID: ${imageId}]\n${(visionDocs.documents[i] || '').substring(0, 500)}\n`;
                    validDocs++;
                  }
                } else {
                  // Mettre à jour la confiance si déjà présent par RAG
                  const existingImg = images.find(img => img.id === imageId);
                  if (existingImg) existingImg.confidence = 1.0;
                }
              }
            }
          });
        }
      } catch (err: any) {
        console.error('[RAG-HYBRID] Erreur recherche explicite par nom de fichier:', err.message);
      }
    }

    if (validDocs === 0 && images.length === 0) {
      console.log(`[RAG-HYBRID] Aucun document trouvé pour: ${query}`);
      return { context: null, images: [] };
    }
    // Si on a des images trouvées par nom de fichier mais aucun doc texte, on retourne quand même les images
    if (validDocs === 0 && images.length > 0) {
      console.log(`[RAG-HYBRID] Aucun doc texte, mais ${images.length} image(s) trouvée(s) par nom de fichier`);
      return { context: null, images };
    }
    
    console.log(`[RAG-HYBRID] Contexte fusionné: ${validDocs} entrées (${images.length} vision)`);
    return { context, images };
  } catch (error: any) {
    console.error('[RAG-HYBRID] Erreur:', error.message);
    return { context: null, images: [] };
  }
}

// ============================================
// VALIDATEURS MÉTIER
// ============================================
class RHValidator {
  static validateEmploye(employe: Employe): string[] {
    const errors: string[] = [];
    if (employe.poste === 'chef_quart' && !employe.equipe) {
      errors.push('Un chef de quart doit être rattaché à une équipe');
    }
    if (employe.poste === 'chef_service' && employe.chef_direct) {
      errors.push('Le chef de service n\'a pas de chef direct');
    }
    return errors;
  }

  static validateAbsences(_absences: Absence[], _equipe: Equipe): boolean {
    return true;
  }

  static validateHeuresSup(_heures: HeureSup[], _employe_id: string, _mois: string): boolean {
    return true;
  }
}

class AlarmeValidator {
  static validateCompartimentEquipement(_alarme: AlarmeDetaillee): boolean {
    return true;
  }

  static niveauReponseRequis(urgence: DegreUrgenceAlarme): string {
    switch (urgence) {
      case 'critique':
      case 'catastrophique':
        return 'intervention_immediate_chef_quart_et_chef_service';
      case 'urgence':
        return 'intervention_sous_1h_chef_bloc';
      default:
        return 'intervention_planifiee_rondier';
    }
  }

  static validateIntervention(_intervention: InterventionAlarme, _employes: Employe[]): boolean {
    return true;
  }
}

/**
 * Détecte si une requête est liée à la vision (mots-clés ou extensions)
 */
function isVisionRelatedQuery(query: string): boolean {
  const visionKeywords = [
    'image', 'photo', 'cliché', 'vue', 'visuel', 'caméra', 
    'graphique', 'schéma', 'plan', 'montre', 'vision', 'vidéo',
    'capture', 'aperçu', 'regarde', 'voir'
  ];
  const lowerQuery = query.toLowerCase();
  return visionKeywords.some(keyword => lowerQuery.includes(keyword)) || /\.(jpg|jpeg|png|gif)/i.test(query);
}

/**
 * Normalise une chaîne pour la comparaison (minuscules, sans extensions, sans séparateurs)
 */
// ============================================
// 🧩 RECHERCHE INTELLIGENTE PUPITRE - LOCALISATION COMPOSANTS
// ============================================

/**
 * Détecte si une requête concerne un composant spécifique d'un pupitre
 * (bouton, vanne, voyant, organe, pompe, etc.)
 */
function isComponentLocalizationQuery(query: string): boolean {
  const lowerQ = query.toLowerCase();
  const componentKeywords = [
    // Composants électriques/mécano
    'bouton', 'button', 'voyant', 'indicateur', 'lampe',
    // Vannes & organes
    'vanne', 'valve', 'robinet', 'clapet', 'obturateur',
    // Organes industriels
    'organe', 'organn', 'pompe', 'compresseur', 'turbine', 'capteur', 'sonde',
    // Régulateurs
    'régulateur', 'regulateur', 'contrôleur', 'controleur', 'pid',
    // Démarrage/arrêt
    'démarrage', 'demarrage', 'arrêt', 'arret', 'reset', 'acquittement',
    // État visible
    'rouge', 'vert', 'orange', 'clignotant', 'allumé', 'éteint',
    // Termes de localisation
    'localise', 'localiser', 'où', 'position', 'situe', 'situer', 'trouve', 'quel pupitre',
    'partie', 'partielle', 'patch', 'zone', 'section',
    // Termes directs de composants
    'composant', 'element', 'élément', 'pièce'
  ];
  return componentKeywords.some(kw => lowerQ.includes(kw));
}

/**
 * Interface pour le résultat de la recherche de localisation
 */
interface ComponentLocationResult {
  found: boolean;
  patches: Array<{
    id: string;
    filename: string;
    description: string;
    tags: string[];
    location: string;
    folder_id: string;
    metadata: any;
    parent: {
      id: string;
      filename: string;
      description: string;
      tags: string[];
      location: string;
      image_type: string;
    } | null;
    gridInfo: {
      row: number;
      col: number;
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    confidence: number;
    matchedZone: any;
  }>;
  contextText: string;
  images: any[];
}

/**
 * Recherche intelligente dans la banque d'images :
 * 1. Cherche les images de type 'simple' (patches) correspondant aux mots-clés
 * 2. Pour chaque patch trouvé, remonte vers le parent (image globale du pupitre) via part_matching_hierarchy
 * 3. Retourne un contexte enrichi avec la localisation précise
 */
async function searchComponentWithHierarchy(query: string): Promise<ComponentLocationResult> {
  console.log(`[COMPONENT-SEARCH] 🔍 Recherche composant pour: "${query.substring(0, 60)}..."`);  
  const result: ComponentLocationResult = {
    found: false,
    patches: [],
    contextText: '',
    images: []
  };

  try {
    const db = getSQLiteCore();
    const lowerQ = query.toLowerCase();
    
    // 1. Récupérer toutes les images et filtrer celles de type 'simple' (patches)
    // On utilise l'API publique getAllImages() puis on filtre
    const allImages = db.vision.getAllImages(500);
    const allSimpleImages = allImages.filter((img: any) => 
      img.image_type === 'simple' || img.imageType === 'simple'
    );

    console.log(`[COMPONENT-SEARCH] ${allSimpleImages.length} images simples trouvées dans la banque`);

    // 2. Filtrer par pertinence (mots-clés présents dans les champs indexés)
    const queryWords = lowerQ
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprimer accents
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3);

    const scoredPatches = allSimpleImages.map((img: any) => {
      let score = 0;
      const searchableText = [
        img.filename || '',
        img.description || '',
        img.location || '',
        img.tags || ''
      ].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      queryWords.forEach(word => {
        if (searchableText.includes(word)) score += 1;
      });

      // Bonus si la description contient exactement des mots-clés de composants
      const componentTerms = ['bouton', 'vanne', 'voyant', 'pompe', 'organe', 'regulateur', 'regulat', 'capteur'];
      componentTerms.forEach(term => {
        if (lowerQ.includes(term) && searchableText.includes(term)) score += 2;
      });
      
      return { img, score };
    });

    // Garder les patches avec un score > 0 et trier par score
    const relevantPatches = scoredPatches
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 résultats

    if (relevantPatches.length === 0) {
      console.log('[COMPONENT-SEARCH] Aucun patch pertinent trouvé');
      return result;
    }

    console.log(`[COMPONENT-SEARCH] ✅ ${relevantPatches.length} patches pertinents trouvés`);

    // 3. Pour chaque patch, chercher le parent dans part_matching_hierarchy
    for (const { img, score } of relevantPatches) {
      // tags et metadata sont déjà des objets parsed par getAllImages()
      const tags: string[] = Array.isArray(img.tags) ? img.tags : [];
      const metadata: any = (typeof img.metadata === 'object' && img.metadata) ? img.metadata : {};

      // Utiliser l'API publique getParent() du module partMatching
      const hierarchyRelation = db.partMatching.getParent(img.id);

      let parentData: ComponentLocationResult['patches'][0]['parent'] = null;
      let gridInfo: ComponentLocationResult['patches'][0]['gridInfo'] = null;
      let matchedZone: any = null;

      if (hierarchyRelation) {
        // Utiliser l'API publique getImage() pour récupérer le parent global
        const parentImg = db.vision.getImage(hierarchyRelation.parentId);

        if (parentImg) {
          const parentTags: string[] = Array.isArray(parentImg.tags) ? parentImg.tags : [];
          
          parentData = {
            id: parentImg.id,
            filename: parentImg.filename,
            description: parentImg.description || '',
            tags: parentTags,
            location: parentImg.location || '',
            image_type: parentImg.image_type || parentImg.imageType || 'global'
          };

          console.log(`[COMPONENT-SEARCH] 🏗️ Parent trouvé: ${parentImg.filename} (${parentImg.id})`);
        }

        // Extraire la zone de correspondance depuis la relation
        matchedZone = hierarchyRelation.matchedZone || {};
      }

      // Extraire les informations de grille depuis les métadonnées du patch
      const patchMeta = metadata?.metadata || metadata;
      if (patchMeta?.grid) {
        gridInfo = {
          row: patchMeta.grid.row ?? (matchedZone?.row ?? 0),
          col: patchMeta.grid.col ?? (matchedZone?.col ?? 0),
          x: patchMeta.grid.x ?? (matchedZone?.x ?? 0),
          y: patchMeta.grid.y ?? (matchedZone?.y ?? 0),
          width: patchMeta.grid.width ?? (matchedZone?.width ?? 0),
          height: patchMeta.grid.height ?? (matchedZone?.height ?? 0)
        };
      } else if (matchedZone?.x !== undefined) {
        gridInfo = {
          row: matchedZone.row ?? 0,
          col: matchedZone.col ?? 0,
          x: matchedZone.x ?? 0,
          y: matchedZone.y ?? 0,
          width: matchedZone.width ?? 0,
          height: matchedZone.height ?? 0
        };
      }

      result.patches.push({
        id: img.id,
        filename: img.filename,
        description: img.description || '',
        tags,
        location: img.location || '',
        folder_id: img.folder_id || img.folderId || '',
        metadata,
        parent: parentData,
        gridInfo,
        confidence: score / Math.max(queryWords.length, 1),
        matchedZone
      });

      // Construire la liste d'images pour le frontend
      result.images.push({
        id: img.id,
        filename: img.filename,
        description: img.description || '',
        url: `/api/vision/images/${img.id}?raw=true`,
        thumbnailUrl: `/api/vision/images/${img.id}?thumbnail=true`,
        tags,
        confidence: score / Math.max(queryWords.length, 1),
        isPatch: true,
        parentId: parentData?.id,
        parentFilename: parentData?.filename
      });

      // Ajouter le parent à la liste d'images si disponible
      if (parentData) {
        const alreadyInImages = result.images.some((im: any) => im.id === parentData!.id);
        if (!alreadyInImages) {
          result.images.push({
            id: parentData.id,
            filename: parentData.filename,
            description: parentData.description,
            url: `/api/vision/images/${parentData.id}?raw=true`,
            thumbnailUrl: `/api/vision/images/${parentData.id}?thumbnail=true`,
            tags: parentData.tags,
            confidence: 0.95,
            isGlobal: true,
            isParentOf: img.id
          });
        }
      }
    }

    if (result.patches.length === 0) return result;

    result.found = true;

    // 4. Construire le texte de contexte enrichi
    let ctx = '=== LOCALISATION PRÉCISE DES COMPOSANTS ===\n\n';
    
    result.patches.forEach((patch, idx) => {
      ctx += `## Composant ${idx + 1}: ${patch.filename}\n`;
      if (patch.description) ctx += `- Description: ${patch.description}\n`;
      if (patch.tags.length > 0) ctx += `- Tags: ${patch.tags.join(', ')}\n`;
      if (patch.location) ctx += `- Zone/Localisation: ${patch.location}\n`;
      
      if (patch.gridInfo) {
        ctx += `- Position dans l'image globale:\n`;
        ctx += `  • Ligne ${patch.gridInfo.row}, Colonne ${patch.gridInfo.col}\n`;
        ctx += `  • Coordonnées: x=${patch.gridInfo.x}, y=${patch.gridInfo.y}\n`;
        ctx += `  • Dimensions: ${patch.gridInfo.width}×${patch.gridInfo.height} pixels\n`;
      }
      
      if (patch.parent) {
        ctx += `- **Pupitre Global associé:**\n`;
        ctx += `  • Nom: ${patch.parent.filename}\n`;
        if (patch.parent.description) ctx += `  • Description du pupitre: ${patch.parent.description}\n`;
        if (patch.parent.location) ctx += `  • Emplacement pupitre: ${patch.parent.location}\n`;
        if (patch.parent.tags.length > 0) ctx += `  • Tags pupitre: ${patch.parent.tags.join(', ')}\n`;
        ctx += `  • ID pupitre: ${patch.parent.id}\n`;
        ctx += `  • Image pupitre: [Voir](/api/vision/images/${patch.parent.id}?raw=true)\n`;
      } else {
        ctx += `- ⚠️ Aucun pupitre global parent trouvé dans la hiérarchie\n`;
        ctx += `  (Ce composant n'a pas encore été rattaché à un pupitre global via registerGlobalImage)\n`;
      }
      
      ctx += `- Image du composant: [Voir](/api/vision/images/${patch.id}?raw=true)\n`;
      ctx += `\n`;
    });

    ctx += `=== FIN LOCALISATION ===\n`;
    result.contextText = ctx;

    console.log(`[COMPONENT-SEARCH] ✅ Contexte enrichi généré (${ctx.length} caractères, ${result.patches.length} composants, ${result.images.length} images)`);
    return result;

  } catch (error: any) {
    console.error('[COMPONENT-SEARCH] ❌ Erreur recherche hiérarchique:', error.message);
    return result;
  }
}

function normalizeForSearch(str: string): string {
  return str.toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '') // Supprimer l'extension (.jpg, .png, etc.)
    .replace(/[^a-z0-9]/g, '');   // Garder uniquement les caractères alphanumériques (supprime espaces, _, -, ', etc.)
}

class PupitreValidator {
  static validateImage(image_base64: string): { valide: boolean; taille_mb: number; erreur?: string } {
    if (!image_base64.startsWith('data:image/')) {
      return { valide: false, taille_mb: 0, erreur: 'Format base64 invalide' };
    }
    const tailleOctets = Buffer.byteLength(image_base64, 'utf8');
    const tailleMb = tailleOctets / (1024 * 1024);
    if (tailleMb > 10) {
      return { valide: false, taille_mb: tailleMb, erreur: 'Image trop volumineuse (>10MB)' };
    }
    return { valide: true, taille_mb: tailleMb };
  }

  static roleAutorisePourPupitre(role: RoleTerrain, pupitreType: PupitreType): boolean {
    const autorisations: Record<RoleTerrain, PupitreType[]> = {
      chef_bloc_TG1_CR1: ['pupitre_chef_bloc_TG1_CR1', 'pupitre_commun_TV'],
      chef_bloc_TG2_CR2: ['pupitre_chef_bloc_TG2_CR2', 'pupitre_commun_TV'],
      rondier_gaz_aux: ['pupitre_rondier_gaz', 'pupitre_auxiliaires'],
      rondier_vapeur: ['pupitre_rondier_vapeur', 'pupitre_commun_TV'],
      rondier_TG1_CR1: ['pupitre_chef_bloc_TG1_CR1', 'pupitre_commun_TV'],
      rondier_TG2_CR2: ['pupitre_chef_bloc_TG2_CR2', 'pupitre_commun_TV'],
      agent_maintenance: ['pupitre_chef_bloc_TG1_CR1', 'pupitre_chef_bloc_TG2_CR2', 'pupitre_commun_TV', 'pupitre_auxiliaires'],
    };
    return autorisations[role]?.includes(pupitreType) ?? false;
  }

  static genererMessageAgent(analyse: AnalysePupitre): string {
    const voyantsAnormaux = analyse.voyants_detectes.filter(
      v => v.etat_detecte.includes('rouge') || v.etat_detecte === 'orange_fixe'
    );
    if (voyantsAnormaux.length === 0) {
      return "Tout est nominal. Aucune action requise.";
    }
    const premier = voyantsAnormaux[0];
    return `Voyant ${premier.etiquette} : ${premier.etat_detecte}. ${premier.action_recommandee || 'Consulter la procédure.'}`;
  }
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================
function extractMessage(body: any): string {
  return body.message || body.prompt || body.text || body.query || '';
}

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function determineMode(body: any, query: string): 'auto' | 'legacy' | 'smart' | 'procedure' | 'agent' {
  if (body.mode) return body.mode;
  
  const normalizedQuery = removeAccents(query.toLowerCase());
  
  // Détection du mode Agent Autonome (Innovation 32)
  if (/organise|planifie|mission|rapport complet|séquence|chaîne/i.test(normalizedQuery)) {
    console.log('[DETERMINE_MODE] Mission complexe détectée → mode agent');
    return 'agent';
  }

  if (query.length < 10) return 'smart';

  const technicalKeywords = getAllTechnicalKeywords();
  
  console.log('[DETERMINE_MODE] Nombre total de mots clés techniques :', technicalKeywords.length);
  console.log('[DETERMINE_MODE] Requête normalisée :', normalizedQuery);
  
  const foundKeywords: string[] = [];
  const isTechnical = technicalKeywords.some(keyword => {
    const normalizedKeyword = removeAccents(keyword.toLowerCase());
    if (normalizedQuery.includes(normalizedKeyword)) {
      foundKeywords.push(keyword);
      return true;
    }
    return false;
  });

  if (isTechnical) {
    console.log(`[DETERMINE_MODE] Mots clés techniques trouvés : ${foundKeywords.slice(0, 5).join(', ')} → mode procedure`);
    return 'procedure';
  }
  
  return 'auto';
}

function generateSuggestions(intent: any): string[] {
  const suggestionsMap: Record<string, string[]> = {
    greeting: ['Comment démarrer la turbine?', 'Afficher les procédures', 'État des équipements'],
    procedure: ['Afficher les étapes', 'Démarrer le guide', 'Voir la documentation'],
    equipment: ['Maintenance préventive', 'Paramètres techniques', 'Historique pannes'],
    maintenance: ['Planification', 'Outils nécessaires', 'Consignes sécurité'],
    security: ['POUI à jour', 'EPI requis', 'Procédures d\'urgence'],
    performance: ['KPI mensuels', 'Optimisation rendement', 'Benchmark'],
    general: ['Documentation technique', 'Formation disponible', 'Support'],
  };
  return suggestionsMap[intent?.category] || ['Documentation', 'Support technique', 'Procédures'];
}

function selectModelForIntent(intent: any): ModelType {
  const modelMap: Record<string, ModelType> = {
    greeting: 'tinyllama:latest',
    general: 'gemma:2b',
    procedure: 'gemma:2b',
    equipment: 'gemma:2b',
    maintenance: 'gemma:2b',
    security: 'gemma2:2b',
    performance: 'gemma:2b',
    training: 'gemma2:2b',
    history: 'gemma:2b',
  };
  return modelMap[intent?.category] || 'gemma:2b';
}

async function clearCache() {
  console.log('[CHAT API] Nettoyage du cache demandé (placeholder)');
  return Promise.resolve();
}

// Simulations pour pupitres (à remplacer par de vrais services IA)
async function analyserPupitre(capture: CapturePupitre): Promise<AnalysePupitre> {
  console.log(`Analyse de la capture pour le pupitre ${capture.pupitre_type}...`);
  return {
    capture_id: uuidv4(),
    date_analyse: new Date().toISOString(),
    voyants_detectes: [
      {
        composant_id: 'led_hrs',
        etiquette: 'DEFAUT HRU',
        etat_detecte: 'orange_clignotant',
        confiance: 0.92,
        action_recommandee: 'Vérifier niveau d\'eau HRU',
      },
    ],
    boutons_identifies: [],
    etat_global: 'attention',
    messages_utilisateur: ['Voyant DEFAUT HRU : orange clignotant. Vérifier le niveau d\'eau du récupérateur.'],
    situations_detectees: ['HRU_LOW_WATER'],
    references_bdd: ['SOL-HRU-012'],
  };
}

async function genererGuide(demande: DemandeGuide): Promise<any> {
  console.log(`Génération du guide pour l'analyse ${demande.analyse_pupitre_id}`);
  return {
    etapes: [
      { numero: 1, action: 'Ouvrir vanne d\'appoint HRU', verification: 'Pression amont > 3 bar', duree_estimee_sec: 30 },
      { numero: 2, action: 'Attendre stabilisation niveau', duree_estimee_sec: 60 },
      { numero: 3, action: 'Appuyer sur bouton RESET du pupitre', verification: 'Voyant orange doit s\'éteindre' },
    ],
    consignes_securite: ['Ne jamais ouvrir vanne si pression > 6 bar', 'Porter lunettes de protection'],
    temps_total_estime: 90,
    niveau_urgence: 'moyen',
  };
}

// ============================================
// API POUR METTRE À JOUR L'ANALYSE VISION (PUT)
// ============================================
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { visionAnalysis } = body;
    
    if (visionAnalysis) {
      currentVisionAnalysis = visionAnalysis;
      console.log('[VISION-RAG] Analyse mise à jour:', visionAnalysis.etatGlobal);
      
      // Mettre à jour le service Vision RAG
      try {
        const visionRAG = getVisionRAGService();
        await visionRAG.initialize();
        visionRAG.setCurrentAnalysis(visionAnalysis);
      } catch (error) {
        console.error('[VISION-RAG] Erreur initialisation service:', error);
      }
      
      return NextResponse.json({ success: true, message: 'Analyse vision mise à jour' });
    }
    
    // Si pas de body, retourner l'état actuel
    return NextResponse.json({ 
      success: true, 
      hasAnalysis: !!currentVisionAnalysis, 
      analysis: currentVisionAnalysis 
    });
  } catch (error) {
    console.error('[VISION-RAG] Erreur PUT:', error);
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
  }
}

// ============================================
// HANDLER POST PRINCIPAL (avec RAG + Routeur LLM + Support Images + Intent Image + Vision RAG)
// ============================================
export async function POST(request: NextRequest) {
  // ============================================
  // DÉTECTION VERCEL - MODE DÉGRADÉ
  // ============================================
  const IS_VERCEL = process.env.VERCEL === '1';
  
  if (IS_VERCEL) {
    console.log('[CHAT-API] 🚀 Mode Vercel détecté - Utilisation du mode dégradé');
  }

  const startTime = Date.now();
  let body: any;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const sessionId = body.sessionId || `api-${uuidv4().substring(0, 8)}`;

  return await runWithSession(sessionId, async () => {
    try {
      const rawMessage = extractMessage(body);
      const userId = body.userId || 'anonymous';

      if (!rawMessage || rawMessage.trim() === '') {
        return NextResponse.json({ error: 'Requête invalide. Veuillez fournir un message.' }, { status: 400 });
      }

      // ============================================
      // MODE DÉGRADÉ VERCEL - RÉPONSE SIMPLE SANS RAG
      // ============================================
      if (IS_VERCEL) {
        console.log('[CHAT-API] ⚠️ Mode Vercel dégradé - Réponse sans RAG ni analyse complexe');
        
        // Vérifier si GROQ_API_KEY est configurée
        const hasGroqKey = !!process.env.GROQ_API_KEY;
        
        if (!hasGroqKey) {
          // Réponse statique si pas de clé API
          const answer = `⚠️ **Service en mode dégradé sur Vercel**

L'instance Vercel ne dispose pas de toutes les ressources nécessaires (ChromaDB, Ollama).

**Pour des réponses complètes :**
- Utilisez la version locale avec \`npm run dev\`
- Configurez une clé API Groq : \`GROQ_API_KEY\`

**Message reçu :** "${rawMessage.substring(0, 100)}"

🔧 Tapez \`/help\` pour voir les commandes disponibles.`;
          
          return NextResponse.json({
            answer,
            confidence: 0.8,
            suggestions: ['/help', '/health', 'Comment utiliser l\'application?'],
            metadata: { mode: 'vercel_degraded', fallback: true },
            imageIntent: { type: 'none', shouldDisplayImage: false, shouldSuggestImage: false, confidence: 0 }
          });
        }
        
        // Si GROQ est configuré, on fait un appel simple
        try {
          const { callLLMRouter } = await import('@/ai/providers/llm-router');
          const routerResult = await callLLMRouter({
            prompt: rawMessage,
            query: rawMessage,
            type: 'response',
            maxTokens: 500,
            temperature: 0.3,
            skipCache: false,
            forceProvider: 'groq',
            bypassRateLimit: false,
            preferLocal: false
          });
          
          return NextResponse.json({
            answer: routerResult.content,
            confidence: routerResult.success ? 0.85 : 0.5,
            suggestions: ['/help', '/health'],
            metadata: { mode: 'vercel', provider: routerResult.provider, fallback: false },
            imageIntent: { type: 'none', shouldDisplayImage: false, shouldSuggestImage: false, confidence: 0 }
          });
        } catch (llmError) {
          console.error('[CHAT-API] Erreur LLM sur Vercel:', llmError);
          return NextResponse.json({
            answer: `⚠️ Erreur de connexion au service LLM. Veuillez vérifier la configuration GROQ_API_KEY.\n\nMessage: ${rawMessage.substring(0, 100)}`,
            confidence: 0.3,
            suggestions: ['/help', '/health'],
            metadata: { mode: 'vercel_error', fallback: true },
            imageIntent: { type: 'none', shouldDisplayImage: false, shouldSuggestImage: false, confidence: 0 }
          });
        }
      }

      // ============================================
      // CODE ORIGINAL POUR LE MODE LOCAL (inchangé à partir d'ici)
      // ============================================
      
      // 🤝 RÉPONSE INSTANTANÉE POUR LES SALUTATIONS (évite les pipelines inutiles)
      const greetingMatch = rawMessage.trim().match(/^(bonjour|bonsoir|salut|coucou|hello|hi|hey|merci|au revoir)[\s\!\.\?]*$/i);
      if (greetingMatch) {
        const greetingKey = greetingMatch[1].toLowerCase();
        const greetingResponses: Record<string, string[]> = {
          bonjour: ["Bonjour ! Comment puis-je vous aider ?", "Bonjour ! En quoi puis-je vous être utile ?"],
          bonsoir: ["Bonsoir ! Comment puis-je vous aider ce soir ?", "Bonsoir ! En quoi puis-je vous être utile ?"],
          salut: ["Salut ! Comment puis-je vous aider ?", "Salut ! Que puis-je faire pour vous ?"],
          coucou: ["Coucou ! Comment puis-je vous aider ?", "Coucou ! Que puis-je faire pour vous ?"],
          hello: ["Hello ! How can I help you?", "Hello! What can I do for you?"],
          hi: ["Hi! How can I help you?", "Hi there! What can I do for you?"],
          hey: ["Hey ! Comment puis-je vous aider ?", "Hey ! Que puis-je faire pour vous ?"],
          merci: ["Avec plaisir ! N'hésitez pas si vous avez d'autres questions.", "De rien ! Je suis là si vous avez besoin."],
          'au revoir': ["Au revoir ! Bonne continuation.", "À bientôt ! N'hésitez pas à revenir si vous avez des questions."],
        };
        const options = greetingResponses[greetingKey] || ["Bonjour ! Comment puis-je vous aider ?"];
        const answer = options[Math.floor(Math.random() * options.length)];
        console.log(`[CHAT API] 🤝 Salutation détectée (${greetingKey}) → réponse directe sans pipeline`);
        return NextResponse.json({
          answer,
          confidence: 1.0,
          suggestions: ['Comment démarrer la turbine?', 'Afficher les procédures', 'État des équipements'],
          metadata: { mode: 'greeting', traceId: 'greeting' }
        });
      }

      // 💬 ENRICHISSEMENT CONTEXTUEL : détecte les follow-ups et reconstruit la requête
      const contextResult = conversationContext.enrichWithContext(sessionId, rawMessage);
      const message = contextResult.enrichedQuery;
      
      // Enregistrer le message utilisateur dans l'historique
      conversationContext.recordUserMessage(sessionId, rawMessage);

      const traceId = requestLogger.startTrace(message);
      roleLogger.appReceiveRequest(traceId, 'POST', '/api/chat', message);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(' SECTION 1 – Réception de la requête');
      if (contextResult.wasEnriched) {
        console.log(' 💬 Message original :', rawMessage);
        console.log(' 💬 Message enrichi  :', message);
        console.log(' 💬 Type enrichissement :', contextResult.contextSource);
      } else {
        console.log(' Question utilisateur :', message);
      }
      console.log(' Session ID :', sessionId);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // ========== ÉTAPE 0 : CACHE SÉMANTIQUE (DragonMemory) ==========
      try {
        const cachedResponse = await semanticCacheService.find(message);
        if (cachedResponse && body._useCache !== false) {
          console.log(`[CHAT-API] ⚡ Réponse servie par le Cache Sémantique (DragonMemory)`);
          return NextResponse.json({
            answer: cachedResponse,
            metadata: { 
              mode: 'semantic_cache', 
              traceId,
              cached: true
            }
          });
        }
      } catch (cacheError) {
        console.error('[CHAT-API] Erreur Cache Sémantique:', cacheError);
      }

      // Validation avec fallback
      let validated: ChatRequest;
      try {
        validated = ChatRequestSchema.parse(body);
      } catch (validationError) {
        console.warn('[CHAT API] Validation échouée, utilisation fallback');
        validated = {
          message,
          mode: 'auto',
          userId: 'anonymous',
          history: [],
          stream: false,
          useCache: true,
        } as any;
      }

      // Validations métier
      if (validated.gestion_rh?.employe) {
        const rhErrors = RHValidator.validateEmploye(validated.gestion_rh.employe);
        if (rhErrors.length) {
          auditLogger.errorOccurred('RH validation error', { errors: rhErrors, traceId });
          return NextResponse.json({ error: 'Incohérence RH', details: rhErrors }, { status: 422 });
        }
      }
      if (validated.alarmes?.alarme && !AlarmeValidator.validateCompartimentEquipement(validated.alarmes.alarme)) {
        auditLogger.errorOccurred('Alarme compartiment/équipement invalide', { alarme: validated.alarmes.alarme.code, traceId });
        return NextResponse.json({ error: 'Incohérence compartiment/équipement' }, { status: 422 });
      }
      if (validated.assistance_terrain?.capture) {
        const imgValid = PupitreValidator.validateImage(validated.assistance_terrain.capture.image_base64);
        if (!imgValid.valide) {
          return NextResponse.json({ error: 'Image invalide', details: imgValid.erreur }, { status: 400 });
        }
        if (!PupitreValidator.roleAutorisePourPupitre(
          validated.assistance_terrain.capture.role_terrain,
          validated.assistance_terrain.capture.pupitre_type
        )) {
          return NextResponse.json({ error: 'Rôle non autorisé pour ce pupitre' }, { status: 403 });
        }
      }

      const mode = determineMode(validated, message);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(' SECTION 2 – Détermination du mode');
      console.log(' Message analysé :', message.substring(0, 100));
      console.log(' Mode détecté :', mode);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      console.log(`[CHAT API] Mode: ${mode} | Trace: ${traceId}`);

      // Options du routeur
      const preferLocal = body._preferLocal === true;
      const forceProvider = body._forceProvider;
      const isSimpleGreeting = /^(bonjour|bonsoir|salut|coucou|hello|hi|hey|merci|au revoir)[\s\!\.\?]*$/i.test(message.trim());
      const useRAG = body._useRAG !== false && !isSimpleGreeting;
      const useRouter = (mode === 'auto' || mode === 'legacy') && body._useRouter !== false;

      // Détermination des zones RAG (Auto-détection si non spécifié)
      const detectedZones = body.zone ? [body.zone as ZoneType] : getRelevantZones(message);
      // On inclut toujours SHARED en plus des zones détectées
      const ragZones: ZoneType[] = Array.from(new Set([...detectedZones, 'SHARED' as ZoneType]));

      // Options Vision
      const useVisionRAG = body._useVisionRAG !== false;
      const isVisionRelevant = isVisionRelatedQuery(message);
      
      // On cherche dans la collection VISION si la requête est visuelle (même sans analyse active)
      const shouldSearchVisionCollection = useVisionRAG && isVisionRelevant;
      
      // On utilise le service Vision RAG (Innovations) UNIQUEMENT si une analyse est disponible
      const shouldUseVisionService = useVisionRAG && isVisionRelevant && !!currentVisionAnalysis;

      let responseData: any = {};
      let success = true;
      let errorMsg: string | undefined;

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(' SECTION 3 – Aiguillage du flux');
      console.log(`   mode=${mode} | useRouter=${useRouter} | _useRouter=${body._useRouter}`);
      console.log(`   → Chemin: ${useRouter ? 'ROUTEUR LLM (callLLMRouter) + Vision RAG' : mode === 'procedure' ? 'CHAT-FLOW (pipeline Vision IA)' : mode === 'smart' ? 'SMART-ROUTER direct' : 'FALLBACK'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      let visionContext: string | null = null;
      let detectedInnovations: any[] = [];
      
      // ============================================
      // SYSTÈME DE COMMANDES SLASH (VISION & UTILITAIRES)
      // ============================================
      const SLASH_COMMANDS: Record<string, (msg: string) => Promise<any>> = {
        '/search-similar': async (msg) => {
          const query = msg.replace('/search-similar', '').trim();
          const searchResponse = await fetch(`${request.nextUrl.origin}/api/vision/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ textQuery: query, threshold: 0.55 })
          });
          const data = await searchResponse.json();
          if (data.found && data.matches?.length > 0) {
            const top = data.matches.slice(0, 3);
            let answer = '🔍 **Résultats de recherche visuelle :**\n\n';
            top.forEach((m: any, i: number) => {
              answer += `${i+1}. **${m.metadata.filename}** (similarité: ${(m.similarity * 100).toFixed(0)}%)\n`;
              answer += `   📝 ${m.metadata.description || 'Pas de description'}\n`;
              answer += `   🏷️ ${(m.metadata.tags || []).join(', ') || 'Aucun tag'}\n`;
              answer += `   🔗 [Voir l'image](/api/vision/images/${m.id})\n\n`;
            });
            return { answer, images: top.map((m: any) => ({ id: m.id, filename: m.metadata.filename, url: `/api/vision/images/${m.id}`, confidence: m.similarity })) };
          }
          return { answer: '❌ Aucune image similaire trouvée pour cette recherche.' };
        },
        '/diagnose': async (msg) => {
          const query = msg.replace('/diagnose', '').trim();
          if (!query || query === '') {
            return { answer: '🩺 **Mode Diagnostic activé.** Veuillez joindre une image à analyser avec votre prochain message. Je pourrai alors détecter les anomalies, l\'état des équipements et les problèmes potentiels.' };
          }
          return { answer: `🩺 **Diagnostic IA activé** pour : "${query}".\n\n⚠️ Pour un diagnostic visuel complet, veuillez joindre une image de l'équipement à analyser.` };
        },
        '/stitch': async (_msg) => {
          return { answer: '🧩 **Mode Assemblage Panoramique activé.**\n\nPour assembler plusieurs images en un panorama :\n1. Téléversez 2+ images qui se chevauchent\n2. Je les assemblerai automatiquement\n3. Vous recevrez l\'image panoramique résultante\n\n📤 Prêt à recevoir vos images.' };
        },
        '/add-reference': async (_msg) => {
          return { answer: '📌 **Mode Enregistrement de Référence activé.**\n\nPour enregistrer une image comme référence industrielle :\n1. Téléversez l\'image du composant/modèle\n2. Ajoutez une description et des tags\n3. L\'image sera indexée pour les futures comparaisons\n\n📤 Envoyez l\'image avec sa description.' };
        },
        '/health': async (_msg) => {
          try {
            const healthResponse = await fetch(`${request.nextUrl.origin}/api/health`);
            const health = await healthResponse.json();
            let answer = '🏥 **État du Système :**\n\n';
            answer += `✅ API Chat : Opérationnelle\n`;
            answer += `📊 Modèles LLM disponibles : ${health.llmProviders?.length || 'N/A'}\n`;
            answer += `💾 Cache sémantique : ${semanticCacheService.getStats().size} entrées\n`;
            return { answer };
          } catch {
            return { answer: '🏥 **État du Système :**\n\n✅ API Chat : Opérationnelle\n⚠️ Impossible de récupérer les métriques détaillées.' };
          }
        },
        '/help': async (_msg) => {
          let answer = '📋 **Commandes disponibles :**\n\n';
          answer += '🔍 `/search-similar <description>` — Rechercher des images similaires\n';
          answer += '🩺 `/diagnose <description>` — Activer le diagnostic IA\n';
          answer += '🧩 `/stitch` — Assembler des images en panorama\n';
          answer += '📌 `/add-reference` — Enregistrer une image de référence\n';
          answer += '🏥 `/health` — Voir l\'état du système\n';
          answer += '❓ `/help` — Afficher cette aide\n';
          return { answer };
        }
      };

      // Détection et exécution des commandes slash
      const trimmedMessage = message.trim();
      const isSlashCommand = trimmedMessage.startsWith('/');
      let slashCommandResult: { answer: string; images?: any[] } | null = null;

      if (isSlashCommand) {
        const commandKey = Object.keys(SLASH_COMMANDS).find(cmd => trimmedMessage.startsWith(cmd));
        if (commandKey) {
          console.log(`[SLASH] Commande détectée : ${commandKey}`);
          try {
            slashCommandResult = await SLASH_COMMANDS[commandKey](trimmedMessage);
          } catch (slashError) {
            console.error(`[SLASH] Erreur commande ${commandKey}:`, slashError);
            slashCommandResult = { answer: `❌ Erreur lors de l'exécution de la commande ${commandKey}. Veuillez réessayer.` };
          }
        } else {
          slashCommandResult = { answer: `❓ Commande inconnue : "${trimmedMessage.split(' ')[0]}". Tapez /help pour voir les commandes disponibles.` };
        }

        // Si c'est une commande slash, on répond directement sans passer par le flux normal
        if (slashCommandResult) {
          responseData = {
            answer: slashCommandResult.answer,
            confidence: 1.0,
            images: slashCommandResult.images || [],
            suggestions: ['/search-similar', '/diagnose', '/stitch', '/help'],
            metadata: { mode: 'slash_command', traceId }
          };
          
          if (!responseData.suggestions || responseData.suggestions.length === 0) {
            responseData.suggestions = generateSuggestions({ category: 'general' });
          }
          
          conversationContext.recordAssistantMessage(sessionId, responseData.answer, {
            wasAmbiguous: false,
            originalQuery: message,
            strategy: 'slash_command',
            confidence: 1.0
          });

          return NextResponse.json(responseData, { status: 200 });
        }
      }

      try {
        // ========== ÉTAPE 0.5 : RECHERCHE INTELLIGENTE LOCALISATION COMPOSANTS PUPITRE ==========
        let componentLocationContext: string | null = null;
        let componentLocationImages: any[] = [];

        if (isComponentLocalizationQuery(message)) {
          console.log('[COMPONENT-SEARCH] 🧩 Requête de localisation de composant détectée');
          try {
            const componentResult = await searchComponentWithHierarchy(message);
            if (componentResult.found && componentResult.contextText) {
              componentLocationContext = componentResult.contextText;
              componentLocationImages = componentResult.images;
              console.log(`[COMPONENT-SEARCH] ✅ Contexte hiérarchique injecté: ${componentResult.patches.length} composants, ${componentResult.images.length} images`);
            }
          } catch (compErr: any) {
            console.warn('[COMPONENT-SEARCH] Erreur (non-bloquante):', compErr.message);
          }
        }

        // 1. INTÉGRATION VISION RAG GLOBALE (si une analyse est disponible ET pertinente)
        if (shouldUseVisionService) {
          try {
            const visionRAG = getVisionRAGService();
            await visionRAG.initialize();
            
            const chatContext = await visionRAG.getChatContext(message);
            if (chatContext.contextData) {
              visionContext = chatContext.contextData;
              detectedInnovations = chatContext.detectedInnovations;
              console.log(`[VISION-RAG] ${detectedInnovations.length} innovations détectées pour la question`);
            }
          } catch (error) {
            console.error('[VISION-RAG] Erreur:', error);
          }
        }

        let toolformerHandled = false;

        // ========== TOOLFORMER ACTIONS (Calcul, Résumé Rapide, etc) ==========
        if (mode === 'auto' || mode === 'smart') {
          const toolDecision = await toolformer.decideAction(message, visionContext || '');
          if (toolDecision.type === 'use_tool' && toolDecision.tool) {
            console.log(`[TOOLFORMER] Outil sélectionné : ${toolDecision.tool} avec confiance ${toolDecision.confidence}`);
            const toolResult = await toolformer.executeTool(toolDecision.tool, toolDecision.params);
            if (toolResult.success) {
              const toolOutput = typeof toolResult.result === 'object' ? JSON.stringify(toolResult.result, null, 2) : String(toolResult.result);
              let finalAnswer = `(Action : ${toolDecision.tool})\n\n${toolOutput}`;
              
              if (toolResult.result?.result) {
                finalAnswer = `Le résultat est : ${toolResult.result.result}`;
              } else if (toolResult.result?.summary) {
                finalAnswer = `Voici le résumé :\n${toolResult.result.summary}`;
              }

              responseData = {
                answer: finalAnswer,
                confidence: toolDecision.confidence,
                metadata: { mode: 'toolformer', tool: toolDecision.tool, traceId }
              };
              success = true;
              toolformerHandled = true;
            } else {
              console.warn(`[TOOLFORMER] Échec de l'outil ${toolDecision.tool}, basculement vers LLM Router.`);
            }
          }
        }

        if (!toolformerHandled && (mode === 'auto' || mode === 'agent')) {
          const isAgenticNeeded = mode === 'agent' || (mode === 'auto' && message.length > 50 && /organise|planifie|exécute/i.test(message));
          
          if (isAgenticNeeded) {
            console.log(`[AGENT] Lancement d'une mission autonome pour: ${message.substring(0, 50)}...`);
            try {
              const agentResponse = await processAgentMission(message, body.userId || 'chat-user');
              responseData = {
                answer: agentResponse.summary,
                details: agentResponse.details,
                steps: agentResponse.steps,
                suggestions: agentResponse.suggestions,
                agentic: true,
                missionId: agentResponse.missionId,
                executionTime: agentResponse.executionTime,
                metadata: { mode: 'agent_mission', traceId }
              };
              toolformerHandled = true;
              success = true;
            } catch (agentError) {
              console.error("[AGENT] Échec de la mission:", agentError);
            }
          }
        }

        if (!toolformerHandled) {
          if (validated.assistance_terrain) {
            const at = validated.assistance_terrain;
            if (at.type_requete === 'capture_pupitre' && at.capture) {
              const analyse = await analyserPupitre(at.capture);
              const messageAgent = PupitreValidator.genererMessageAgent(analyse);
              responseData = { analyse, message_agent: messageAgent, metadata: { mode: 'pupitre_analyse', traceId } };
            } else if (at.type_requete === 'demander_guide' && at.demande_guide) {
              const guide = await genererGuide(at.demande_guide);
              responseData = { guide, metadata: { mode: 'pupitre_guide', traceId } };
            } else if (at.type_requete === 'etat_pupitre' && at.consultation_distance) {
              responseData = { etat: 'Nominal', derniere_capture: null, metadata: { mode: 'etat_pupitre', traceId } };
            } else {
              throw new Error('Type de requête assistance terrain non supporté');
            }
          }
          else if (validated.alarmes?.requete_type === 'traiter_alarme' && validated.alarmes.alarme) {
            const alarme = validated.alarmes.alarme;
            const reponse = `Alarme ${alarme.code} (${alarme.degre_urgence}) : ${alarme.consigne_immediate}`;
            responseData = { reponse, metadata: { mode: 'alarme', traceId } };
          }
          else if (validated.gestion_rh?.requete_type === 'demande_conge' && validated.gestion_rh.absence) {
            responseData = { message: 'Demande de congé enregistrée', metadata: { mode: 'rh', traceId } };
          }
          else if (useRouter) {
            console.log(`[CHAT API] Utilisation du routeur LLM (RAG=${useRAG}, zone=${ragZones}, preferLocal=${preferLocal})`);
            
            let finalPrompt = message;
            let ragImages: any[] = [];
            
            if (useRAG) {
              console.log(`[RAG] Recherche de contexte pour: "${message.substring(0, 50)}..."`);
              const ragResult = await getRAGContextWithImages(message, ragZones, shouldSearchVisionCollection);
              
              let visionEnrichment: any = null;
              try {
                const visionIntegration = getVisionIntegrationService();
                if (visionIntegration.isReady()) {
                  console.log('[VISION-ENRICHMENT] Analyse et enrichissement de la requête...');
                  const enrichmentResult = await visionIntegration.processQuery(message);
                  visionEnrichment = enrichmentResult;
                  
                  if (enrichmentResult.enrichment.metadata.enriched) {
                    console.log(`[VISION-ENRICHMENT] Enrichissement ajouté: ${enrichmentResult.enrichment.visionEnrichment.images?.length || 0} images`);
                  }
                }
              } catch (error) {
                console.error('[VISION-ENRICHMENT] Erreur enrichissement:', error);
              }
              
              if (ragResult.context) {
                let promptSections = [
                  'Voici des extraits de documents techniques pertinents pour répondre à la question.',
                  '',
                  '=== EXTRATS DOCUMENTS ===',
                  ragResult.context
                ];
                
                if (componentLocationContext) {
                  promptSections.splice(3, 0, '', '=== BANQUE D\'IMAGES - LOCALISATION COMPOSANTS PUPITRE ===', componentLocationContext);
                }
                
                if (visionContext) {
                  promptSections.push('', '=== ANALYSE VISION INDUSTRIELLE ===', visionContext);
                }
                
                if (visionEnrichment?.enrichment.metadata.enriched) {
                  const enrichmentData = visionEnrichment.enrichment.visionEnrichment;
                  promptSections.push('', '=== ENRICHISSEMENT VISION INTELLIGENT ===');
                  
                  if (enrichmentData.suggestions && enrichmentData.suggestions.length > 0) {
                    promptSections.push('Actions suggérées:');
                    enrichmentData.suggestions.forEach((suggestion: string) => {
                      promptSections.push(`- ${suggestion}`);
                    });
                  }
                  
                  if (enrichmentData.images && enrichmentData.images.length > 0) {
                    promptSections.push('', 'Images pertinentes détectées:');
                    enrichmentData.images.forEach((img: ImageMetadata) => {
                      promptSections.push(`- ${img.filename}: ${img.description || 'Image disponible'}`);
                    });
                  }
                  
                  if (enrichmentData.actions && enrichmentData.actions.length > 0) {
                    promptSections.push('', 'Actions disponibles:');
                    enrichmentData.actions.forEach((action: { label: string; description: string; }) => {
                      promptSections.push(`- ${action.label}: ${action.description}`);
                    });
                  }
                }
                
                promptSections.push('', '=== QUESTION ===', message, '', '=== INSTRUCTIONS ===');
                
                if (visionContext || visionEnrichment?.enrichment.metadata.enriched) {
                  promptSections.push('Répondez en vous basant sur les extraits ci-dessus et l\'analyse vision si disponible.');
                  promptSections.push('Exploitez pleinement les fonctionnalités vision pour enrichir votre réponse.');
                  if (componentLocationContext) {
                    promptSections.push('Pour les composants de pupitre: précisez toujours dans quel pupitre global il se trouve, sa position (ligne/colonne, coordonnées) et ses tags/description.');
                  }
                } else {
                  promptSections.push('Répondez en vous basant sur les extraits ci-dessus.');
                  if (componentLocationContext) {
                    promptSections.push('Vous avez des informations précises de localisation dans la banque d\'images, utilisez-les pour répondre avec précision.');
                  }
                }
                
                promptSections.push('Si des visuels sont mentionnés (ex: [IMAGE: image.jpg | ID: id]), parlez-en car ils seront affichés à l\'utilisateur.');
                
                finalPrompt = promptSections.join('\n');
                
                console.log(`[RAG] Contexte ajouté au prompt (${ragResult.context?.length || 0} caractères)`);
                
                ragImages = ragResult.images;
                if (componentLocationImages.length > 0) {
                  const existingIds = new Set(ragImages.map((i: any) => i.id));
                  componentLocationImages.forEach(cImg => {
                    if (!existingIds.has(cImg.id)) ragImages.push(cImg);
                  });
                }
                if (ragImages.length > 0) {
                  console.log(`[RAG] ${ragImages.length} image(s) trouvées dans le contexte (dont composants pupitre)`);
                }
              }
              
              if (!ragResult?.context && ragResult?.images?.length > 0) {
                ragImages = ragResult.images;
                if (componentLocationImages.length > 0) {
                  const existingIds = new Set(ragImages.map((i: any) => i.id));
                  componentLocationImages.forEach(cImg => {
                    if (!existingIds.has(cImg.id)) ragImages.push(cImg);
                  });
                }
                console.log(`[RAG-FILENAME] ${ragImages.length} image(s) trouvée(s) par correspondance de nom de fichier`);
                
                if (ragImages.length > 0) {
                  const imageRefs = ragImages.map(img =>
                    `[IMAGE: ${img.filename} | ID: ${img.id}]`
                  ).join('\n');
                  finalPrompt = `${imageRefs}\n\n=== QUESTION ===\n${message}\n\n=== INSTRUCTIONS ===\nL'utilisateur demande à voir l'image mentionnée. Elle sera affichée directement.`;
                }
              }
              
              if (!ragResult?.context && componentLocationContext) {
                finalPrompt = [
                  '=== BANQUE D\'IMAGES - LOCALISATION COMPOSANTS PUPITRE ===',
                  componentLocationContext,
                  '',
                  '=== QUESTION ===',
                  message,
                  '',
                  '=== INSTRUCTIONS ===',
                  'Répondez en vous basant sur la localisation précise des composants dans la banque d\'images.',
                  'Indiquez dans quel pupitre global se trouve le composant, sa position précise, et ses métadonnées.',
                  'Si des images sont disponibles (patches et pupitre global), mentionnez-les car elles seront affichées.'
                ].join('\n');
                ragImages = componentLocationImages;
              }

              if (!useRAG && visionContext) {
                finalPrompt = `${visionContext}

=== QUESTION ===
${message}

=== INSTRUCTIONS ===
Répondez en vous basant sur l'analyse vision ci-dessus.
Si des visuels sont mentionnés (ex: [IMAGE: image.jpg | ID: id]), parlez-en car ils seront affichés à l'utilisateur.`;
                console.log(`[VISION-RAG] Contexte vision seul utilisé`);
              }
            
              console.log(`[ORCHESTRATION] Tentative d'orchestration intelligente pour: "${message.substring(0, 40)}..."`);
              try {
                const orchResult = await orchestrateResponse({
                  query: message,
                  sessionId,
                  userId,
                  options: {
                    skipVision: !useVisionRAG,
                    skipTraining: false,
                    skipAmbiguityCheck: contextResult.contextSource === 'clarification_followup',
                  },
                  visionContext: visionContext || undefined,
                  detectedInnovations: detectedInnovations
                });

                const isTrainingSource = orchResult.metadata?.usedTrainingVoix || orchResult.metadata?.bestSourceType === 'training';
                const confidenceThreshold = isTrainingSource ? 0.6 : 0.85;
                
                if (orchResult.answer && (isTrainingSource || orchResult.confidence > confidenceThreshold)) {
                  console.log(`[ORCHESTRATION] ✅ Succès via ${isTrainingSource ? 'VOIX TRAINING' : 'ORCHESTRATEUR'} (confiance: ${(orchResult.confidence * 100).toFixed(0)}%)`);
                  
                  const orchImages = orchResult.metadata?.images?.length ? orchResult.metadata.images : ragImages;
                  const hasImages = orchImages && orchImages.length > 0;
                  responseData = {
                    answer: orchResult.answer,
                    confidence: orchResult.confidence || 0.9,
                    sources: orchResult.metadata?.sources ? [orchResult.metadata.sources] : [],
                    suggestions: generateSuggestions({ category: 'training' }),
                    usedTrainingVoix: !!orchResult.metadata?.usedTrainingVoix,
                    images: hasImages ? orchImages : undefined,
                    imageIntent: hasImages ? {
                      type: 'explicit',
                      shouldDisplayImage: true,
                      shouldSuggestImage: true,
                      confidence: 1.0
                    } : undefined,
                    metadata: {
                      mode: 'orchestrator',
                      traceId,
                      strategy: orchResult.strategy,
                      confidence: orchResult.confidence,
                      usedTrainingVoix: !!orchResult.metadata?.usedTrainingVoix,
                      needsClarification: orchResult.metadata?.needsClarification,
                      clarificationQuestion: orchResult.metadata?.clarificationQuestion
                    }
                  };
                  
                  success = true;
                  console.log(`[CHAT API] Orchestrateur terminé avec succès (Training=${!!orchResult.metadata?.usedTrainingVoix})`);
                } else {
                  console.log(`[ORCHESTRATION] ℹ️ Pas de réponse directe haute confiance, basculement vers LLM Router`);
                  
                  const routerResult = await callLLMRouter({
                    prompt: finalPrompt,
                    query: message,
                    type: 'response',
                    maxTokens: validated.ia?.maxTokens || 2000,
                    temperature: validated.ia?.temperature || 0.3,
                    skipCache: !validated.useCache,
                    forceProvider: forceProvider,
                    bypassRateLimit: false,
                    preferLocal: preferLocal
                  });
                  
                  const allImages = [...(routerResult.images || []), ...ragImages];
                  const uniqueById = allImages.filter((img, index, self) => 
                    index === self.findIndex(i => i.id === img.id)
                  );
                  const normalizedMessage = normalizeForSearch(message);
                  uniqueById.forEach(img => {
                    if (img.filename) {
                      const normalizedFilename = normalizeForSearch(img.filename);
                      if (normalizedMessage.includes(normalizedFilename)) {
                        img.confidence = 1.0;
                      }
                    }
                  });
                  
                  let uniqueImages = uniqueById;
                  if (uniqueById.length > 1) {
                    const sorted = [...uniqueById].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
                    const bestConfidence = sorted[0].confidence || 0.1;
                    uniqueImages = sorted.filter(img => (img.confidence || 0) >= Math.max(0.4, bestConfidence * 0.85));
                  }

                  responseData = {
                    answer: routerResult.content,
                    confidence: routerResult.success ? 0.85 : 0.3,
                    suggestions: generateSuggestions({ category: 'general' }),
                    images: uniqueImages.length > 0 ? uniqueImages : undefined,
                    imageIntent: {
                      type: (routerResult.imageIntent?.type !== 'none' ? routerResult.imageIntent?.type : (isVisionRelevant ? 'explicit' : 'none')) || 'none',
                      shouldDisplayImage: (uniqueImages.length > 0 && isVisionRelevant) || !!routerResult.imageIntent?.shouldDisplayImage,
                      shouldSuggestImage: !!routerResult.imageIntent?.shouldSuggestImage,
                      confidence: routerResult.imageIntent?.confidence || (isVisionRelevant ? 1.0 : 0)
                    },
                    visionEnrichment: visionEnrichment?.enrichment || null,
                    metadata: {
                      mode: 'router',
                      traceId,
                      provider: routerResult.provider,
                      model: routerResult.model,
                      fallbackChain: routerResult.fallbackChain,
                      fromCache: routerResult.fromCache,
                      duration: routerResult.duration,
                      visionUsed: !!visionContext,
                      visionEnriched: !!visionEnrichment?.enrichment.metadata.enriched
                    }
                  };
                  
                  console.log(`[CHAT API] Routeur terminé: provider=${routerResult.provider}, images=${uniqueImages.length}`);
                }
              } catch (orchError) {
                console.error('[ORCHESTRATION] Erreur fatale, fallback LLM Router:', orchError);
                const routerResult = await callLLMRouter({
                  prompt: finalPrompt,
                  query: message,
                  type: 'response'
                });
                responseData = { answer: routerResult.content, metadata: { mode: 'fallback' } };
              }
            }
          } else if (mode === 'procedure') {
            const result = await chat({
              text: message,
              history: validated.history || [],
              documentContext: validated.documentContext || '',
              episodicMemory: [],
              distilledRules: [],
              userProfile: validated.userProfile,
              hierarchyNodes: [],
              strictness: validated.ia?.strictness || 0.7,
              maxTokens: validated.ia?.maxTokens || 1000,
              temperature: validated.ia?.temperature || 0.3,
              responseFormat: validated.ia?.responseFormat || 'détaillé',
              procedureMode: validated.procedure?.mode || 'proposal',
              currentProcedureId: validated.procedure?.id_procedure,
              currentStepIndex: validated.procedure?.etape_actuelle,
              procedureAction: validated.procedure?.action,
              model: validated.ia?.model || 'tinyllama:latest',
              visionContext: visionContext || undefined,
              detectedInnovations: detectedInnovations
            });
            responseData = {
              answer: result.answer,
              confidence: result.confidence || 0.8,
              sources: result.sources || [],
              suggestions: result.suggestions || generateSuggestions({ category: 'procedure' }),
              images: result.images || [],
              showImagesDirectly: result.showImagesDirectly || false,
              imagesAvailable: result.imagesAvailable || false,
              imageIntent: {
                type: 'none',
                shouldDisplayImage: false,
                shouldSuggestImage: false,
                confidence: 0
              },
              metadata: { mode: 'procedure', traceId },
            };
          } else if (mode === 'smart') {
            const router = getSmartRouter();
            if (!router) throw new Error('SmartRouter non disponible');
            const result = await router.route(message, {
              userId: validated.userId,
              sessionId: validated.sessionId,
              image: validated.image ? Buffer.from(validated.image, 'base64') : undefined,
              mode: validated.mode,
            });
            const suggestions = generateSuggestions(result.intent);
            responseData = {
              answer: result.response,
              confidence: result.intent.confidence,
              source: result.intent.category,
              intent: result.intent,
              suggestions,
              images: result.images,
              imageIntent: {
                type: 'none',
                shouldDisplayImage: false,
                shouldSuggestImage: false,
                confidence: 0
              },
              metadata: { 
                mode: 'smart', 
                traceId,
                hybrid: result.hybrid
              },
            };
          } else if (mode === 'auto') {
            const analyzer = getIntentAnalyzer();
            if (!analyzer) throw new Error('IntentAnalyzer non disponible');
            const intent = await analyzer.analyze(message);
            const model = selectModelForIntent(intent);
            const result = await chat({
              text: message,
              history: validated.history || [],
              documentContext: validated.documentContext || '',
              episodicMemory: [],
              distilledRules: [],
              userProfile: validated.userProfile,
              hierarchyNodes: [],
              strictness: validated.ia?.strictness || 0.7,
              maxTokens: validated.ia?.maxTokens || 1000,
              temperature: validated.ia?.temperature || 0.3,
              responseFormat: validated.ia?.responseFormat || 'détaillé',
              model,
              procedureMode: 'proposal',
              visionContext: visionContext || undefined,
              detectedInnovations: detectedInnovations
            });
            const suggestions = generateSuggestions(intent);
            responseData = {
              answer: result.answer,
              confidence: result.confidence || 0.8,
              intent,
              suggestions,
              images: result.images || [],
              imageIntent: {
                type: 'none',
                shouldDisplayImage: false,
                shouldSuggestImage: false,
                confidence: 0
              },
              metadata: { 
                mode: 'auto', 
                model, 
                traceId,
                hybrid: result.hybridMetadata
              },
            };
          } else {
            const result = await callHybridProvider(message);
            responseData = {
              answer: result.answer,
              source: result.source,
              confidence: result.confidence || 0.7,
              imageIntent: {
                type: 'none',
                shouldDisplayImage: false,
                shouldSuggestImage: false,
                confidence: 0
              },
              metadata: { mode: 'legacy', traceId },
            };
          }
        }
      } catch (err: any) {
        success = false;
        errorMsg = err.message;
        responseData = {
          answer: 'Je suis désolé, une erreur technique est survenue. Veuillez réessayer.',
          error: process.env.NODE_ENV === 'development' ? errorMsg : 'Erreur interne',
          imageIntent: {
            type: 'none' as const,
            shouldDisplayImage: false,
            shouldSuggestImage: false,
            confidence: 0
          },
          metadata: { mode: 'error', traceId },
        };
      }

      const duration = Date.now() - startTime;
      performanceLogger.recordChatTotal(duration, success, traceId, { mode, query: message });
      auditLogger.chatQuery(userId, message, responseData.answer?.length || 0, duration, success, errorMsg);
      requestLogger.endTrace(responseData.answer, errorMsg);

      if (!responseData.suggestions && responseData.answer) {
        try {
          const historyMock = (validated.history || []).map((h: any) => ({
             id: uuidv4(),
             actionId: uuidv4(),
             policyId: 'chat',
             success: true,
             timestamp: Date.now(),
             context: h.content,
             action: { type: 'chat', params: { text: h.content } },
             result: { content: h.content },
             feedback: 1
          }));

          const predictions = await predictNextActions(historyMock, responseData.answer, {
             enableContextual: true,
             maxSuggestions: 3
          });

          if (predictions && predictions.length > 0) {
             responseData.suggestions = predictions.map((p: any) => p.description);
          } else {
             responseData.suggestions = generateSuggestions({ category: 'general' });
          }
        } catch (err) {
          console.warn('[CHAT API] Erreur lors de la prédiction des suggestions:', err);
          responseData.suggestions = generateSuggestions({ category: 'general' });
        }
      }

      if (responseData.answer) {
        const isClarification = responseData.metadata?.needsClarification ||
          responseData.metadata?.strategy === 'clarification';

        let clarificationOptions: string[] | undefined;
        if (isClarification && responseData.answer) {
          const optionsMatch = responseData.answer.match(/Options?\s*:\s*(.+)/i);
          if (optionsMatch) {
            clarificationOptions = optionsMatch[1].split(/[,;]/).map((o: string) => o.trim()).filter(Boolean);
          }
        }

        conversationContext.recordAssistantMessage(sessionId, responseData.answer, {
          wasAmbiguous: isClarification,
          clarificationOptions,
          originalQuery: message,
          strategy: responseData.metadata?.strategy,
          confidence: responseData.confidence
        });
      }

      if (contextResult.wasEnriched) {
        responseData.metadata = {
          ...responseData.metadata,
          contextEnriched: true,
          contextSource: contextResult.contextSource,
          originalMessage: contextResult.originalMessage
        };
      }

      try {
        const combinedTextForMindmap = `${message} ${responseData.answer || ''}`;
        const detectedCircuits = mindMapChatEnricher.detectCircuitIds(combinedTextForMindmap);
        if (detectedCircuits.length > 0) {
          const mindmapMeta = mindMapChatEnricher.getClientEnrichmentMetadata(detectedCircuits);
          if (mindmapMeta) {
            responseData.metadata = {
              ...responseData.metadata,
              mindmap: mindmapMeta,
              hasMindmap: true,
              circuits: detectedCircuits,
              messageHint: mindmapMeta.messageHint
            };
            
            const circuitId = detectedCircuits[0];
            const suggestionText = `🧠 Schéma mental ${circuitId}`;
            if (responseData.suggestions) {
              if (!responseData.suggestions.includes(suggestionText)) {
                responseData.suggestions = [suggestionText, ...responseData.suggestions].slice(0, 3);
              }
            } else {
              responseData.suggestions = [suggestionText];
            }
          }
        }
      } catch (enrichError) {
        console.warn('[CHAT-API] Échec enrichissement mindmap:', enrichError);
      }

      if (success && responseData.answer && responseData.answer.length > 50 && body._useCache !== false) {
        try {
          await semanticCacheService.save(message, responseData.answer, { mode, traceId });
        } catch (saveError) {
          console.warn('[CHAT-API] Échec sauvegarde cache sémantique:', saveError);
        }
      }

      return NextResponse.json(responseData, { status: success ? 200 : 500 });
    } catch (error: any) {
      console.error('[CHAT API] Erreur globale:', error);
      requestLogger.endTrace(undefined, error.message);
      auditLogger.errorOccurred(error.message, { endpoint: '/api/chat', traceId: 'unknown' });
      return NextResponse.json(
        {
          error: 'Erreur interne du serveur',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 500 }
      );
    }
  });
}
// ============================================
// HANDLER GET (documentation et streaming)
// ============================================
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  const stream = searchParams.get('stream') === 'true';

  if (!query) {
    let routerStatus: { available: boolean; providers: { name: string; available: boolean }[] } = { 
      available: false, 
      providers: [] 
    };
    try {
      const health = await getLLMHealthStatus();
      const providersList = Object.entries(health).map(([name, status]) => ({ 
        name, 
        available: status.available 
      }));
      routerStatus = {
        available: Object.values(health).some(p => p.available),
        providers: providersList
      };
    } catch (e) {
      console.warn('[CHAT API] Impossible de récupérer le statut du routeur');
    }

    return NextResponse.json({
      status: 'healthy',
      service: 'chat-api-industrial',
      version: '9.0',
      router: routerStatus,
      endpoints: {
        POST: '/api/chat - Envoyer un message (supports _useRouter, _useRAG, _preferLocal, _forceProvider, zone)',
        GET: '/api/chat?query=... - Tester avec GET',
        PUT: '/api/chat - Mettre à jour l\'analyse vision',
        DELETE: '/api/chat/cache - Vider le cache',
      },
      modes: ['auto', 'legacy', 'smart', 'procedure', 'router'],
      features: {
        rh: true,
        alarmes: true,
        pupitres: true,
        vision: true,
        multiProviderRouter: true,
        rag: true,
        images: true,
        imageIntent: true,
        visionRAG: true,
        innovations: 40
      },
    });
  }

  if (stream) {
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generateResponseStream(query, { model: 'tinyllama:latest' })) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`));
          controller.close();
        }
      },
    });
    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  try {
    const result = await chat({
      text: query,
      history: [],
      documentContext: '',
      episodicMemory: [],
      distilledRules: [],
      userProfile: undefined,
      hierarchyNodes: [],
      strictness: 0.7,
      maxTokens: 500,
      temperature: 0.3,
      responseFormat: 'concis',
      procedureMode: 'proposal',
      model: 'tinyllama:latest',
    });
    return NextResponse.json({ query, answer: result.answer, confidence: result.confidence, images: result.images || [] });
  } catch (error: any) {
    return NextResponse.json({ query, error: error.message, answer: 'Erreur lors du traitement' }, { status: 500 });
  }
}

// ============================================
// HANDLER DELETE (cache)
// ============================================
export async function DELETE(request: NextRequest) {
  const url = request.nextUrl.pathname;
  if (url.includes('/cache')) {
    try {
      await clearCache();
      return NextResponse.json({ success: true, message: 'Cache vidé avec succès' });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: 'Endpoint non trouvé' }, { status: 404 });
}

// ============================================
// HANDLER OPTIONS (CORS)
// ============================================
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}