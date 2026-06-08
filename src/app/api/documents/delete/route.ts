export const runtime = 'edge';

// src/app/api/documents/delete/route.ts
/**
 * @fileOverview API Route /api/documents/delete - Suppression industrielle robuste.
 * Version zones - Gère la purge physique et vectorielle avec ciblage par zone.
 * CORRIGÉ : conversion du chemin relatif en absolu pour suppression effective.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { rm } from 'fs/promises';
import { CollectionName, ZoneType, ZONES_CONFIG } from '@/ai/vector/chromadb-schema';
import path from 'path';
import { DOCUMENTS_ROOT } from '@/lib/document-manager/config';

/**
 * Nettoie un chemin reçu du frontend pour garantir un chemin relatif propre.
 * Supprime les racines Windows, les backslashes, et extrait la partie
 * postérieure à 'centrale_documents'.
 */
function sanitizeFilePath(inputPath: string): string {
  if (!inputPath) return '';
  
  // Supprimer toute racine de lecteur Windows (C:\, D:\, etc.)
  let clean = inputPath.replace(/^[A-Z]:\\/i, '');
  
  // Remplacer les backslashes par des slashes
  clean = clean.replace(/\\/g, '/');
  
  // Si le chemin contient 'centrale_documents', extraire la partie après
  const docRootMarker = 'centrale_documents';
  const idx = clean.indexOf(docRootMarker);
  if (idx !== -1) {
    clean = clean.substring(idx + docRootMarker.length);
  }
  
  // Supprimer les slashs multiples et le slash initial/final
  clean = clean.replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  
  // Supprimer les séquences de traversée (../)
  clean = clean.replace(/(\.\.[\/\\])+/g, '');
  
  return clean;
}

export async function DELETE(req: NextRequest) {
  try {
    const { documentId, filePath, zone } = await req.json();
    
    if (!documentId) {
      return NextResponse.json(
        { error: 'Le paramètre "documentId" est requis.' }, 
        { status: 400 }
      );
    }

    console.log(`[API][DELETE] Lancement de la purge pour : ${documentId}`);
    if (zone) console.log(`[API][DELETE] Zone ciblée : ${zone}`);
    if (filePath) console.log(`[API][DELETE] Chemin reçu : ${filePath}`);

    const manager = ChromaDBManager.getInstance();
    
    // 1. DÉTERMINER LA ZONE (si non fournie, on tente de l'extraire du chemin)
    let targetZone: ZoneType | null = null;
    if (zone && ZONES_CONFIG[zone as ZoneType]) {
      targetZone = zone as ZoneType;
    } else if (filePath) {
      // Nettoyer d'abord pour obtenir un chemin relatif propre
      const cleanPath = sanitizeFilePath(filePath);
      const firstSegment = cleanPath.split('/')[0];
      if (firstSegment && ZONES_CONFIG[firstSegment as ZoneType]) {
        targetZone = firstSegment as ZoneType;
        console.log(`[API][DELETE] Zone détectée depuis le chemin : ${targetZone}`);
      }
    }
    
    // 2. PURGE VECTORIELLE : ciblée si zone connue, sinon scan complet
    try {
      let collectionsToPurge: Array<{ id: string }> = [];
      
      if (targetZone) {
        console.log(`[API][DELETE] Purge vectorielle ciblée sur la zone : ${targetZone}`);
        collectionsToPurge = [{ id: targetZone }];
      } else {
        console.log(`[API][DELETE] Zone inconnue, purge vectorielle sur toutes les collections`);
        collectionsToPurge = await manager.getAllCollectionsStats();
      }
      
      const purgePromises = collectionsToPurge.map(async (coll) => {
        try {
          const idsToDelete = [documentId];
          for (let i = 0; i < 150; i++) {
            idsToDelete.push(`${documentId}_chunk_${i}`);
          }
          return manager.deleteDocuments(coll.id as CollectionName, idsToDelete);
        } catch (e) {
          return Promise.resolve();
        }
      });

      await Promise.allSettled(purgePromises);
      console.log(`[API][DELETE] Purge vectorielle terminée sur ${collectionsToPurge.length} collection(s).`);
    } catch (chromaError) {
      console.warn(`[API][DELETE] Avertissement purge ChromaDB:`, chromaError);
    }
    
    // 3. SUPPRESSION PHYSIQUE (fichier ou dossier)
    if (filePath) {
      try {
        // 🔥 Correction : nettoyer le chemin et construire le chemin absolu
        const cleanPath = sanitizeFilePath(filePath);
        const absolutePath = path.join(DOCUMENTS_ROOT, cleanPath);
        const normalizedPath = path.normalize(absolutePath);
        const normalizedRoot = path.normalize(DOCUMENTS_ROOT);
        
        // Vérification de sécurité
        if (!normalizedPath.startsWith(normalizedRoot)) {
          console.error(`[API][DELETE] Tentative de suppression hors de DOCUMENTS_ROOT : ${normalizedPath}`);
          return NextResponse.json({ error: 'Chemin non autorisé' }, { status: 403 });
        }
        
        console.log(`[API][DELETE] Suppression physique : ${normalizedPath}`);
        await rm(normalizedPath, { recursive: true, force: true });
        console.log(`[API][DELETE] ✅ Suppression physique réussie`);
      } catch (fileError: any) {
        console.error(`[API][DELETE] Erreur lors de la suppression physique :`, fileError.message);
        // On continue pour renvoyer un succès partiel si la purge vectorielle a réussi
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Document purgé ${targetZone ? `de la zone ${targetZone}` : 'de toutes les zones'} et du disque.` 
    });

  } catch (error: any) {
    console.error('[API][DELETE] Échec critique de l\'opération de purge:', error);
    return NextResponse.json({ 
      error: 'Erreur interne lors de la purge.',
      details: error.message || String(error)
    }, { status: 500 });
  }
}