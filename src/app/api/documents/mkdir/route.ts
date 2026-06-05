// src/app/api/documents/mkdir/route.ts
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { fileService } from '@/lib/document-manager/file-service';
import { DOCUMENTS_ROOT } from '@/lib/document-manager/config';

/**
 * Nettoie un chemin reçu du frontend pour garantir un chemin relatif propre.
 * Supprime les racines Windows, les backslashes, et extrait la partie
 * postérieure à 'centrale_documents'.
 */
function sanitizeParentPath(inputPath: string): string {
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

export async function POST(req: NextRequest) {
  try {
    const { parentPath, name } = await req.json();
    
    if (!parentPath || !name) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    // Nettoyer le chemin parent reçu
    const cleanParent = sanitizeParentPath(parentPath);
    
    // Construire le chemin complet et vérifier qu'il est bien sous DOCUMENTS_ROOT
    const fullPath = path.join(DOCUMENTS_ROOT, cleanParent, name);
    const normalizedFull = path.normalize(fullPath);
    const normalizedRoot = path.normalize(DOCUMENTS_ROOT);
    
    if (!normalizedFull.startsWith(normalizedRoot)) {
      return NextResponse.json({ 
        error: 'Chemin non autorisé (tentative de traversée)' 
      }, { status: 403 });
    }
    
    console.log(`[API][MKDIR] Création du dossier : ${normalizedFull}`);
    
    // Construire le chemin du parent et rediriger vers le service
    const parentFullPath = path.join(DOCUMENTS_ROOT, cleanParent);
    await fileService.createDirectory(parentFullPath, name);
    
    // Retourner le chemin relatif pour le frontend
    const relativePath = path.relative(DOCUMENTS_ROOT, normalizedFull).replace(/\\/g, '/');
    
    return NextResponse.json({ 
      success: true, 
      newPath: relativePath,
      message: 'Dossier créé avec succès.' 
    });
  } catch (error: any) {
    console.error('[API][MKDIR] Erreur:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}