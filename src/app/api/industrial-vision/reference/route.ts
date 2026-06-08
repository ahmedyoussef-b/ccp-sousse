export const runtime = 'edge';

// src/app/api/industrial-vision/reference/route.ts

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';

// Configuration des chemins
const REFERENCES_BASE_PATH = path.join(process.cwd(), 'data', 'industrial-references');
const REFERENCE_TYPES = ['marche_normale', 'arret_normale', 'defaut'];

// Types
interface ReferenceImage {
  id: string;
  nom: string;
  type: string;
  chemin: string;
  taille: number;
  dateAjout: string;
  metadata?: any;
  features?: number[];
}

// Initialisation du dossier de références
async function ensureReferenceDirectories() {
  for (const type of REFERENCE_TYPES) {
    const typePath = path.join(REFERENCES_BASE_PATH, type);
    if (!fs.existsSync(typePath)) {
      await fsPromises.mkdir(typePath, { recursive: true });
    }
  }
}

// Récupérer toutes les images de référence
async function getAllReferences(): Promise<ReferenceImage[]> {
  await ensureReferenceDirectories();
  
  const references: ReferenceImage[] = [];
  
  for (const type of REFERENCE_TYPES) {
    const typePath = path.join(REFERENCES_BASE_PATH, type);
    
    if (fs.existsSync(typePath)) {
      const files = fs.readdirSync(typePath);
      
      for (const file of files) {
        if (file.match(/\.(jpg|jpeg|png)$/i)) {
          const filePath = path.join(typePath, file);
          const stats = fs.statSync(filePath);
          
          // Chercher le fichier JSON associé
          const jsonPath = filePath.replace(/\.(jpg|jpeg|png)$/i, '.json');
          let metadata = null;
          if (fs.existsSync(jsonPath)) {
            metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          }
          
          references.push({
            id: `${type}_${file}`,
            nom: file,
            type: type,
            chemin: filePath,
            taille: stats.size,
            dateAjout: stats.birthtime.toISOString(),
            metadata: metadata
          });
        }
      }
    }
  }
  
  return references;
}

// Sauvegarder les métadonnées d'une référence
async function saveMetadata(imagePath: string, metadata: any) {
  const jsonPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '.json');
  await fsPromises.writeFile(jsonPath, JSON.stringify(metadata, null, 2));
  return jsonPath;
}

// Supprimer une référence
async function deleteReference(imagePath: string) {
  if (fs.existsSync(imagePath)) {
    await fsPromises.unlink(imagePath);
  }
  
  const jsonPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '.json');
  if (fs.existsSync(jsonPath)) {
    await fsPromises.unlink(jsonPath);
  }
}

// GET - Récupérer les références
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    
    await ensureReferenceDirectories();
    
    // Récupérer une référence spécifique par ID
    if (id) {
      const references = await getAllReferences();
      const reference = references.find(ref => ref.id === id);
      
      if (!reference) {
        return NextResponse.json(
          { success: false, error: 'Référence non trouvée' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({ success: true, data: reference });
    }
    
    // Filtrer par type
    let references = await getAllReferences();
    if (type && REFERENCE_TYPES.includes(type)) {
      references = references.filter(ref => ref.type === type);
    }
    
    // Statistiques
    const stats = {
      total: references.length,
      byType: {
        marche_normale: references.filter(r => r.type === 'marche_normale').length,
        arret_normale: references.filter(r => r.type === 'arret_normale').length,
        defaut: references.filter(r => r.type === 'defaut').length
      }
    };
    
    return NextResponse.json({
      success: true,
      data: references,
      stats: stats,
      basePath: REFERENCES_BASE_PATH
    });
    
  } catch (error) {
    console.error('Erreur GET /api/industrial-vision/reference:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST - Ajouter une nouvelle référence
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const type = formData.get('type') as string;
    const metadataRaw = formData.get('metadata') as string;
    
    // Validation
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Aucune image fournie' },
        { status: 400 }
      );
    }
    
    if (!type || !REFERENCE_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Type invalide. Types acceptés: ${REFERENCE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validation du type MIME
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Format non supporté. Utilisez JPG ou PNG' },
        { status: 400 }
      );
    }
    
    await ensureReferenceDirectories();
    
    // Sauvegarder l'image
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const timestamp = Date.now();
    const filename = `${timestamp}_${file.name}`;
    const typePath = path.join(REFERENCES_BASE_PATH, type);
    const filePath = path.join(typePath, filename);
    
    await fsPromises.writeFile(filePath, buffer);
    
    // Traiter les métadonnées
    let metadata = {};
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch (e) {
        console.warn('Métadonnées invalides, ignorées');
      }
    }
    
    // Ajouter des métadonnées par défaut
    metadata = {
      ...metadata,
      dateAjout: new Date().toISOString(),
      type: type,
      filename: file.name,
      taille: buffer.length,
      source: 'upload'
    };
    
    // Sauvegarder les métadonnées
    await saveMetadata(filePath, metadata);
    
    // Créer l'objet référence
    const reference: ReferenceImage = {
      id: `${type}_${filename}`,
      nom: filename,
      type: type,
      chemin: filePath,
      taille: buffer.length,
      metadata: metadata,
      dateAjout: ''
    };
    
    return NextResponse.json({
      success: true,
      data: reference,
      message: `Référence ajoutée dans ${type}`
    });
    
  } catch (error) {
    console.error('Erreur POST /api/industrial-vision/reference:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une référence
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const path = searchParams.get('path');
    
    if (!id && !path) {
      return NextResponse.json(
        { success: false, error: 'ID ou chemin requis' },
        { status: 400 }
      );
    }
    
    let imagePath: string | null = null;
    
    // Trouver par ID
    if (id) {
      const references = await getAllReferences();
      const reference = references.find(ref => ref.id === id);
      if (reference) {
        imagePath = reference.chemin;
      }
    }
    
    // Ou utiliser le chemin direct
    if (!imagePath && path) {
      imagePath = path;
    }
    
    if (!imagePath || !fs.existsSync(imagePath)) {
      return NextResponse.json(
        { success: false, error: 'Référence non trouvée' },
        { status: 404 }
      );
    }
    
    // Vérifier que le fichier est bien dans le dossier des références
    if (!imagePath.startsWith(REFERENCES_BASE_PATH)) {
      return NextResponse.json(
        { success: false, error: 'Chemin non autorisé' },
        { status: 403 }
      );
    }
    
    await deleteReference(imagePath);
    
    return NextResponse.json({
      success: true,
      message: 'Référence supprimée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur DELETE /api/industrial-vision/reference:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// PUT - Mettre à jour les métadonnées d'une référence
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, metadata } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID requis' },
        { status: 400 }
      );
    }
    
    const references = await getAllReferences();
    const reference = references.find(ref => ref.id === id);
    
    if (!reference) {
      return NextResponse.json(
        { success: false, error: 'Référence non trouvée' },
        { status: 404 }
      );
    }
    
    // Charger les métadonnées existantes
    const jsonPath = reference.chemin.replace(/\.(jpg|jpeg|png)$/i, '.json');
    let existingMetadata = {};
    
    if (fs.existsSync(jsonPath)) {
      existingMetadata = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    }
    
    // Fusionner les métadonnées
    const updatedMetadata = {
      ...existingMetadata,
      ...metadata,
      dateModification: new Date().toISOString()
    };
    
    await saveMetadata(reference.chemin, updatedMetadata);
    
    return NextResponse.json({
      success: true,
      data: { ...reference, metadata: updatedMetadata },
      message: 'Métadonnées mises à jour'
    });
    
  } catch (error) {
    console.error('Erreur PUT /api/industrial-vision/reference:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

