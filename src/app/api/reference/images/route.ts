// src/app/api/reference/images/route.ts

import { NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get('entityId');
  const entityType = searchParams.get('entityType') as 'zone' | 'circuit' | 'parametre';

  if (!entityId || !entityType) {
    return NextResponse.json({ error: 'Missing entityId or entityType' }, { status: 400 });
  }

  try {
    const sqlite = getSQLiteCore();
    const images = sqlite.reference.getLinkedImages(entityId, entityType);
    
    // Parser les champs JSON
    const formattedImages = images.map(img => ({
      ...img,
      tags: JSON.parse(img.tags || '[]'),
      metadata: JSON.parse(img.metadata || '{}'),
      // Ne pas renvoyer le base64 complet dans la liste si trop lourd, 
      // mais ici on en a besoin pour l'aperçu si filepath est manquant
      image: img.image_base64 
    }));

    return NextResponse.json({ images: formattedImages });
  } catch (error) {
    console.error('Error fetching linked images:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, imageId, metadata } = await request.json();
    const sqlite = getSQLiteCore();

    if (action === 'update_metadata') {
      const existing = sqlite.vision.getImage(imageId);
      if (!existing) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }

      // Mettre à jour l'image avec les nouvelles données
      // On s'attend à ce que 'metadata' dans le body contienne les champs à mettre à jour
      // ou que le body contienne directement les champs
      const updateData = {
        ...existing,
        ...metadata, // Si le front envoie les champs à la racine de l'objet metadata
        description: metadata.description ?? existing.description,
        tags: metadata.tags ?? existing.tags,
        equipment_state: metadata.equipmentState ?? metadata.equipment_state ?? existing.equipment_state,
        metadata: {
          ...existing.metadata,
          ...(metadata.metadata || {})
        }
      };
      
      sqlite.vision.updateImage(imageId, updateData);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error updating image metadata:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
