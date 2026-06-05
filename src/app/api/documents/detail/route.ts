// src/app/api/documents/detail/route.ts

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { DOCUMENTS_ROOT } from '@/lib/document-manager/config';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { ZONES_CONFIG, type ZoneType } from '@/ai/vector/chromadb-schema';
import { generateDocumentId } from '@/lib/document-manager/config';
import visionService from '@/lib/services/visionService';

/**
 * GET /api/documents/detail?path=...
 * Récupère les détails complets d'un document (Physique + Vectoriel)
 * Version zones - détermine la collection (zone) à partir du premier segment du chemin relatif.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'Chemin manquant' }, { status: 400 });
    }

    console.log('[API][DETAIL] Raw path:', filePath);
    
    // Décoder le chemin (gérer le double encodage)
    let decodedPath = decodeURIComponent(filePath);
    console.log('[API][DETAIL] Decoded path:', decodedPath);
    
    // Si le chemin contient encore des caractères encodés, décoder à nouveau
    let previousPath = '';
    while (decodedPath !== previousPath && decodedPath.includes('%')) {
      previousPath = decodedPath;
      decodedPath = decodeURIComponent(decodedPath);
    }
    console.log('[API][DETAIL] Fully decoded:', decodedPath);
    
    // Construire le chemin absolu
    let fullPath: string;
    
    if (path.isAbsolute(decodedPath)) {
      // Sécurité: vérifier que le chemin absolu reste dans le projet
      if (!decodedPath.toLowerCase().includes('ahmed') && !decodedPath.toLowerCase().includes('ccp')) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
      fullPath = decodedPath;
    } else {
      fullPath = path.join(DOCUMENTS_ROOT, decodedPath);
    }
    
    fullPath = path.normalize(fullPath);
    console.log('[API][DETAIL] Normalized path:', fullPath);
    
    // Vérifier que le fichier existe
    let fileExists = false;
    try {
      await fs.access(fullPath);
      fileExists = true;
    } catch (error) {
      console.warn('[API][DETAIL] Path-based access failed, trying documentId lookup:', fullPath);
      
      // Fallback 1 : Est-ce que "filePath" est en fait un documentId ?
      try {
        const manager = ChromaDBManager.getInstance();
        await manager.initialize();
        
        // Parcourir les zones pour trouver ce documentId
        const zones = ['SHARED', 'TG1', 'TG2', 'B0_AUXILIAIRES', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'MAINTENANCE', 'RH', 'A0_DIVERS'];
        
        for (const zone of zones) {
          const doc = await manager.getDocumentsByFilter(zone as ZoneType, { id: decodedPath }, 1);
          if (doc && doc.ids.length > 0) {
            const metadata = doc.metadatas[0];
            const sourcePath = metadata.source || metadata.path;
            if (sourcePath) {
              console.log('[API][DETAIL] Resolved documentId to source path:', sourcePath);
              fullPath = path.isAbsolute(sourcePath) ? sourcePath : path.join(DOCUMENTS_ROOT, sourcePath);
              fullPath = path.normalize(fullPath);
              await fs.access(fullPath);
              fileExists = true;
              break;
            }
          }
        }
      } catch (dbError) {
        console.error('[API][DETAIL] ChromaDB fallback error:', dbError);
      }

      // Fallback 3 : Est-ce une image vision ? (UUID)
      if (!fileExists) {
        try {
          const visionData = await visionService.getImageData(decodedPath);
          if (visionData) {
            console.log('[API][DETAIL] Resolved documentId to vision image:', visionData.filename);
            fullPath = path.isAbsolute(visionData.filepath) 
              ? visionData.filepath 
              : path.join(process.cwd(), visionData.filepath);
            fullPath = path.normalize(fullPath);
            await fs.access(fullPath);
            fileExists = true;
          }
        } catch (vError) {
          console.warn('[API][DETAIL] Vision fallback error:', vError);
        }
      }
    }
    
    if (!fileExists) {
      return NextResponse.json({ 
        error: 'Fichier non trouvé',
        path: filePath,
        resolvedPath: fullPath,
        root: DOCUMENTS_ROOT
      }, { status: 404 });
    }

    // Déterminer l'ID du document
    let documentId: string;
    try {
      const visionData = await visionService.getImageData(decodedPath);
      if (visionData) {
        documentId = visionData.id;
      } else {
        documentId = generateDocumentId(fullPath);
      }
    } catch (e) {
      documentId = generateDocumentId(fullPath);
    }
    
    // Lire les informations du fichier
    const stats = await fs.stat(fullPath);
    const isDirectory = stats.isDirectory();

    const fileName = path.basename(fullPath);
    const extension = isDirectory ? '' : path.extname(fullPath).toLowerCase();
    const isImage = !isDirectory && ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(extension);
    const isText = !isDirectory && ['.txt', '.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.xml', '.pdf'].includes(extension);
    
    // Lire le contenu si c'est un fichier texte
    let content = '';
    if (isText && !isDirectory) {
      try {
        content = await fs.readFile(fullPath, 'utf-8');
        content = content.substring(0, 10000); // Limiter pour la performance
      } catch (readError) {
        console.warn('[API][DETAIL] Could not read file as text:', readError);
        content = '[Contenu binaire - non affichable]';
      }
    }
    
    // Déterminer la zone (collection) à partir du premier segment du chemin relatif
    const relativePath = path.relative(DOCUMENTS_ROOT, fullPath);
    const pathParts = relativePath.split(path.sep);
    const firstSegment = pathParts[0] || ''; // Ex: "B0_AUXILIAIRES", "TG1", etc.
    
    let zoneName: ZoneType = 'SHARED'; // Valeur par défaut
    let collectionName: ZoneType  = zoneName;
    
    // Vérifier si le premier segment correspond à une zone connue
    if (firstSegment && (firstSegment as keyof typeof ZONES_CONFIG) in ZONES_CONFIG) {
      zoneName = firstSegment as ZoneType;
      collectionName = zoneName;
    } else {
      // Fallback : essayer de mapper les anciens dossiers (pour compatibilité)
      console.warn(`[API][DETAIL] Segment inconnu: ${firstSegment}, utilisation de SHARED`);
    }
    
    console.log('[API][DETAIL] Zone détectée:', zoneName, 'Collection:', collectionName);
    
    console.log('[API][DETAIL] DocumentId final:', documentId);
    
    let vectorData = null;
    let chunkData = {
      count: 0,
      sizes: [] as number[],
      totalChars: 0,
    };
    
    try {
      const manager = ChromaDBManager.getInstance();
      await manager.initialize();
      
      // ─── 1. Récupérer le premier chunk pour les métadonnées ───────────────
      // On cherche le chunk_0 qui contient les métadonnées enrichies du document
      const searchResult = await manager.search(collectionName, fileName, { 
        nResults: 5
      });
      
      // Trouver le premier résultat qui correspond à ce document
      if (searchResult && searchResult.ids && searchResult.ids.length > 0) {
        // Les résultats sont dans des tableaux imbriqués pour queryTexts
        const ids = Array.isArray(searchResult.ids[0]) ? searchResult.ids[0] : searchResult.ids;
        const metadatas = Array.isArray(searchResult.metadatas[0]) ? searchResult.metadatas[0] : searchResult.metadatas;
        const documents = Array.isArray(searchResult.documents[0]) ? searchResult.documents[0] : searchResult.documents;
        const distances = Array.isArray(searchResult.distances[0]) ? searchResult.distances[0] : searchResult.distances;
        
        // Trouver l'index du premier résultat appartenant à ce document
        const matchIdx = ids.findIndex((id: string) => 
          id && (id.startsWith(documentId) || String(id) === documentId)
        );
        
        const idx = matchIdx >= 0 ? matchIdx : 0;
        
        if (ids[idx]) {
          vectorData = {
            id: ids[idx],
            metadata: metadatas[idx] || {},
            content: documents[idx] || '',
            distance: distances[idx]
          };
        }
      }
      
      // ─── 2. Compter TOUS les chunks de ce document via parent_id ─────────
      console.log('[API][DETAIL] Comptage des chunks via parent_id:', documentId);
      const chunksResult = await manager.getDocumentsByFilter(
        collectionName,
        { parent_id: documentId },
        1000
      );
      
      if (chunksResult && chunksResult.ids.length > 0) {
        chunkData.count = chunksResult.ids.length;
        chunkData.sizes = chunksResult.documents.map(doc => (doc || '').length);
        chunkData.totalChars = chunkData.sizes.reduce((a, b) => a + b, 0);
        
        console.log(`[API][DETAIL] ${chunkData.count} chunks trouvés pour le document`);
        
        // Si on n'a pas de vectorData depuis la recherche textuelle, utiliser le premier chunk
        if (!vectorData && chunksResult.ids.length > 0) {
          vectorData = {
            id: chunksResult.ids[0],
            metadata: chunksResult.metadatas[0] || {},
            content: chunksResult.documents[0] || '',
            distance: undefined
          };
        }
        
        // Enrichir les métadonnées avec les infos de chunking
        if (vectorData) {
          (vectorData as any).metadata = {
            ...(vectorData as any).metadata,
            chunk_total: chunkData.count,
            chunk_sizes: chunkData.sizes.slice(0, 10), // Limiter pour la réponse JSON
          };
        }
      } else {
        // Fallback: essayer avec la métadonnée chunk_total du vectorData
        const chunkTotal = vectorData?.metadata?.chunk_total;
        if (chunkTotal && Number(chunkTotal) > 0) {
          chunkData.count = Number(chunkTotal);
          console.log(`[API][DETAIL] chunk_total depuis métadonnées: ${chunkData.count}`);
        } else {
          console.warn('[API][DETAIL] Aucun chunk trouvé pour parent_id:', documentId);
        }
      }
      
    } catch (e) {
      console.warn('[API][DETAIL] ChromaDB error:', e);
      // Ne pas échouer si ChromaDB n'est pas disponible
    }
    
    // Retourner la réponse structurée
    return NextResponse.json({
      success: true,
      file: {
        name: fileName,
        path: fullPath,
        size: stats.size,
        modifiedAt: stats.mtime,
        createdAt: stats.birthtime,
        extension: extension.substring(1),
        isImage: isImage,
        isText: isText,
        isDirectory: isDirectory,
        content: content,
        folder: firstSegment,        // zone
        zone: zoneName               // zone explicite
      },
      vector: vectorData,
      collection: collectionName,
      zone: zoneName,
      documentId: documentId,
      chunks: chunkData,             // ← Données de chunking directement accessibles
    });

  } catch (error: any) {
    console.error('[API][DETAIL] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Erreur interne du serveur',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}