export const runtime = 'edge';

// src/app/api/documents/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { DOCUMENTS_ROOT } from '@/lib/document-manager/config';
import { ZoneType, ZONES_CONFIG } from '@/ai/vector/chromadb-schema';

const typeToSubfolder: Record<string, string> = {
  equipement: 'equipements',
  alarme_hmi: 'alarmes',
  alarme_technique: 'alarmes_techniques',
  procedure: 'procedures',
  image: 'images',
  synoptique: 'synoptiques',
  composant: 'composants',
  rh: 'organigramme',
  maintenance: 'gammes',
  document_brut: 'documents_bruts'
};

/**
 * Nettoie un chemin utilisateur pour éviter les chemins absolus
 * et les traversées de répertoire. PRÉSERVE LA STRUCTURE COMPLÈTE.
 */
function sanitizeCustomPath(inputPath: string): string {
  if (!inputPath) return '';
  
  // Supprimer toute racine de lecteur Windows (C:\, D:\, etc.)
  let clean = inputPath.replace(/^[A-Z]:\\/i, '');
  
  // Remplacer les backslashes par des slashes
  clean = clean.replace(/\\/g, '/');
  
  // Supprimer les séquences de traversée (../)
  clean = clean.replace(/(\.\.[\/\\])+/g, '');
  
  // Supprimer UNIQUEMENT les occurrences de "centrale_documents" ou "data" RÉPÉTÉES
  // (mais préserver la première occurrence qui fait partie du chemin relatif)
  const parts = clean.split('/');
  const filtered = parts.filter((p, idx) => {
    // Toujours garder le segment s'il est au début (c'est le chemin fourni par l'utilisateur)
    if (idx === 0) return true;
    // Supprimer les doublons de "centrale_documents" ou "data"
    if (p === 'centrale_documents' || p === 'data') {
      // Vérifier si ce segment apparaît déjà plus tôt
      return !parts.slice(0, idx).includes(p);
    }
    // Éliminer les restes de lecteur
    if (p.match(/^[A-Z]:$/i)) return false;
    return true;
  });
  clean = filtered.join('/');
  
  // Supprimer les slashs multiples
  clean = clean.replace(/\/+/g, '/');
  
  // Supprimer le slash final
  clean = clean.replace(/\/$/, '');
  
  console.log(`[SANITIZE] Input: "${inputPath}" -> Output: "${clean}"`);
  return clean;
}

export async function POST(req: NextRequest) {
  console.log('[API][UPLOAD] New upload request received');
  const startTime = Date.now();
  
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const zone = formData.get('zone') as ZoneType | null;
    const documentType = formData.get('type') as string || 'document_brut';
    const customPathRaw = formData.get('path') as string || '';
    
    console.log(`[API][UPLOAD] Inputs: file=${file.name}, zone=${zone}, pathRaw=${customPathRaw}`);
    
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }
    
    if (!zone || !ZONES_CONFIG[zone]) {
      return NextResponse.json({ 
        error: `Zone invalide ou non spécifiée. Zones valides: ${Object.keys(ZONES_CONFIG).join(', ')}` 
      }, { status: 400 });
    }
    
    // Nettoyer le customPath
    const customPath = sanitizeCustomPath(customPathRaw);
    
    // Détecter si le premier segment du customPath est déjà une zone valide
    const authorizedZones = Object.keys(ZONES_CONFIG);
    const firstSegment = customPath.split('/')[0];
    const isFirstSegmentValidZone = authorizedZones.includes(firstSegment);

    let relativePath = '';
    if (customPath) {
      // ✅ CORRECTION : Préserver COMPLÈTEMENT le chemin sélectionné par l'utilisateur
      // Si le chemin commence déjà par la zone, l'utiliser tel quel
      if (customPath.startsWith(zone + '/') || customPath === zone) {
        relativePath = customPath;
        console.log(`[API][UPLOAD] Chemin utilisateur préservé : ${relativePath}`);
      }
      // Si c'est une zone valide différente, l'utiliser tel quel (permet multi-zone)
      else if (isFirstSegmentValidZone) {
        relativePath = customPath;
        console.log(`[API][UPLOAD] Chemin valide par zone : ${relativePath}`);
      }
      // Sinon, préfixer par la zone actuelle (par défaut)
      else {
        relativePath = path.join(zone, customPath);
        console.log(`[API][UPLOAD] Préfixage zone : ${zone}/${customPath} -> ${relativePath}`);
      }
    } else {
      // Comportement standard : classer par sous-dossier de type
      const subfolder = typeToSubfolder[documentType] || 'documents_bruts';
      relativePath = path.join(zone, subfolder);
      console.log(`[API][UPLOAD] Routage standard par type : ${relativePath}`);
    }
    
    // Construire le chemin complet et le normaliser
    const fullPath = path.join(DOCUMENTS_ROOT, relativePath, file.name);
    const dir = path.dirname(fullPath);
    
    // Vérification de sécurité : le dossier final doit être à l'intérieur de DOCUMENTS_ROOT
    const normalizedDir = path.normalize(dir);
    const normalizedRoot = path.normalize(DOCUMENTS_ROOT);
    if (!normalizedDir.startsWith(normalizedRoot)) {
      console.error(`[API][UPLOAD] Tentative d'écriture hors de DOCUMENTS_ROOT : ${normalizedDir}`);
      return NextResponse.json({ 
        error: 'Chemin non autorisé (tentative de traversée de répertoire)' 
      }, { status: 403 });
    }
    
    await mkdir(dir, { recursive: true });
    
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buffer);
    
    console.log(`[API][UPLOAD] Fichier sauvegardé : ${fullPath}. L'indexation sera prise en charge par file-service en tâche de fond.`);
    
    const processingTime = Date.now() - startTime;
    
    return NextResponse.json({ 
      success: true, 
      path: fullPath,
      relativePath,
      zone,
      type: documentType,
      fileName: file.name,
      processingTime,
      message: `Document transféré dans la zone ${zone} (${documentType}). Mise en file d'attente pour indexation.`
    });
    
  } catch (error: any) {
    console.error('[API][UPLOAD] Erreur critique :', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Échec de l\'upload ou du traitement',
      timestamp: Date.now()
    }, { status: 500 });
  }
}