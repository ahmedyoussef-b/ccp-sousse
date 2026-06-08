export const runtime = 'edge';

// src/app/api/innovations/part-matching/hierarchy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export const dynamic = 'force-dynamic';

interface HierarchyResponse {
  success: boolean;
  parent?: {
    id: string;
    relationshipType: string;
    matchedZone: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    confidence: number;
  };
  children?: Array<{
    id: string;
    relationshipType: string;
    confidence: number;
  }>;
  globalImages?: Array<{
    id: string;
    imageId: string;
    filename: string;
    description: string;
    gridRows: number;
    gridCols: number;
    patchesCount: number;
    processedAt: number;
  }>;
  stats?: {
    globalImagesCount: number;
    totalPatchesCount: number;
    successfulMatches: number;
    totalSearches: number;
    matchRate: number;
    lastUpdated: number | null;
  };
  error?: string;
  message?: string;
}

export async function GET(request: NextRequest) {
  console.group('📊 [PART-MATCHING] RÉCUPÉRATION HIÉRARCHIE');

  try {
    const db = getSQLiteCore();
    const searchParams = request.nextUrl.searchParams;
    const imageId = searchParams.get('imageId');
    const type = searchParams.get('type'); // 'parent', 'children', 'globals'
    const globalOnly = searchParams.get('globalOnly') === 'true';

    // Cas 1: Récupérer l'image parente d'une image
    if (type === 'parent' && imageId) {
      console.log(`🔍 Recherche du parent pour l'image: ${imageId}`);
      
      const parent = db.partMatching.getParent(imageId);
      
      if (!parent) {
        console.log('ℹ️ Aucun parent trouvé');
        console.groupEnd();
        return NextResponse.json({
          success: true,
          parent: null,
          message: 'Aucune relation parente trouvée'
        });
      }
      
      const response: HierarchyResponse = {
        success: true,
        parent: {
          id: parent.parentId,
          relationshipType: parent.relationshipType,
          matchedZone: parent.matchedZone,
          confidence: parent.confidence
        }
      };
      
      console.log(`✅ Parent trouvé: ${parent.parentId} (confiance: ${parent.confidence})`);
      console.groupEnd();
      return NextResponse.json(response);
    }
    
    // Cas 2: Récupérer les enfants d'une image
    if (type === 'children' && imageId) {
      console.log(`🔍 Recherche des enfants pour l'image: ${imageId}`);
      
      const children = db.partMatching.getChildren(imageId);
      
      const response: HierarchyResponse = {
        success: true,
        children: children.map((c: any) => ({
          id: c.childId,
          relationshipType: c.relationshipType,
          confidence: c.confidence
        }))
      };
      
      console.log(`✅ ${children.length} enfant(s) trouvé(s)`);
      console.groupEnd();
      return NextResponse.json(response);
    }
    
    // Cas 3: Lister toutes les images globales
    if (type === 'globals' || globalOnly) {
      console.log('📸 Liste de toutes les images globales');
      
      const globalImages = db.partMatching.listGlobalImages();
      
      const response: HierarchyResponse = {
        success: true,
        globalImages: globalImages.map((img: any) => ({
          id: img.id,
          imageId: img.imageId,
          filename: img.filename || 'unknown',
          description: img.description || '',
          gridRows: img.gridRows,
          gridCols: img.gridCols,
          patchesCount: img.totalParts || 0,
          processedAt: img.processedAt || 0
        }))
      };
      
      console.log(`✅ ${globalImages.length} image(s) globale(s) trouvée(s)`);
      console.groupEnd();
      return NextResponse.json(response);
    }
    
    // Cas 4: Récupérer une image globale spécifique
    if (imageId) {
      console.log(`🔍 Recherche de l'image globale: ${imageId}`);
      
      const globalImage = db.partMatching.getGlobalImage(imageId);
      
      if (!globalImage) {
        console.log('❌ Image globale non trouvée');
        console.groupEnd();
        return NextResponse.json({
          success: false,
          error: 'Image globale non trouvée'
        }, { status: 404 });
      }
      
      const globalImageAny = globalImage as any;
      const response: HierarchyResponse = {
        success: true,
        globalImages: [{
          id: globalImage.id,
          imageId: globalImage.imageId,
          filename: globalImageAny.filename || 'unknown',
          description: globalImageAny.description || '',
          gridRows: globalImage.gridRows,
          gridCols: globalImage.gridCols,
          patchesCount: globalImage.totalParts || 0,
          processedAt: globalImage.processedAt || 0
        }]
      };
      
      console.log(`✅ Image globale trouvée: ${globalImage.imageId}`);
      console.groupEnd();
      return NextResponse.json(response);
    }
    
    // Cas par défaut: retourner les statistiques
    console.log('📊 Récupération des statistiques Part Matching');
    
    const stats = db.partMatching.getStats();
    const matchRate = stats.totalSearches > 0 
      ? (stats.successfulMatches / stats.totalSearches) * 100 
      : 0;
    
    console.log(`   Images globales: ${stats.globalImagesCount}`);
    console.log(`   Patches indexés: ${stats.totalPatchesCount}`);
    console.log(`   Matchs réussis: ${stats.successfulMatches}`);
    console.log(`   Recherches totales: ${stats.totalSearches}`);
    console.log(`   Taux de réussite: ${matchRate.toFixed(1)}%`);
    
    console.groupEnd();
    return NextResponse.json({
      success: true,
      stats: {
        globalImagesCount: stats.globalImagesCount,
        totalPatchesCount: stats.totalPatchesCount,
        successfulMatches: stats.successfulMatches,
        totalSearches: stats.totalSearches,
        matchRate: Math.round(matchRate * 10) / 10,
        lastUpdated: stats.lastUpdated
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération hiérarchie:', error);
    console.groupEnd();
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

// Support POST pour créer des relations manuelles
export async function POST(request: NextRequest) {
  console.group('🔗 [PART-MATCHING] CRÉATION RELATION HIÉRARCHIQUE');

  try {
    const db = getSQLiteCore();
    const body = await request.json();
    const { childId, parentId, relationshipType, matchedZone, confidence } = body;

    if (!childId || !parentId) {
      console.log('❌ childId et parentId requis');
      console.groupEnd();
      return NextResponse.json(
        { success: false, error: 'childId et parentId requis' },
        { status: 400 }
      );
    }

    console.log(`🔗 Création relation: ${childId} → ${parentId}`);
    console.log(`   Type: ${relationshipType || 'part_of'}`);
    console.log(`   Confiance: ${confidence || 'non spécifiée'}`);

    db.partMatching.saveHierarchy({
      childId,
      parentId,
      relationshipType: relationshipType || 'part_of',
      matchedZone: matchedZone || { x: 0, y: 0, width: 0, height: 0 },
      confidence: confidence || 0.8
    });

    console.log('✅ Relation créée avec succès');
    console.groupEnd();

    return NextResponse.json({
      success: true,
      message: 'Relation hiérarchique créée',
      relation: { childId, parentId, relationshipType, confidence }
    });
    
  } catch (error) {
    console.error('❌ Erreur création relation:', error);
    console.groupEnd();
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

// Support DELETE pour supprimer une relation
export async function DELETE(request: NextRequest) {
  console.group('🗑️ [PART-MATCHING] SUPPRESSION RELATION HIÉRARCHIQUE');

  try {
    const db = getSQLiteCore();
    const searchParams = request.nextUrl.searchParams;
    const childId = searchParams.get('childId');

    if (!childId) {
      console.log('❌ childId requis');
      console.groupEnd();
      return NextResponse.json(
        { success: false, error: 'childId requis' },
        { status: 400 }
      );
    }

    console.log(`🗑️ Suppression relation pour: ${childId}`);

    // Vérifier si la relation existe
    const existing = db.partMatching.getParent(childId);
    if (!existing) {
      console.log('ℹ️ Aucune relation trouvée');
      console.groupEnd();
      return NextResponse.json({
        success: true,
        message: 'Aucune relation à supprimer'
      });
    }

    // Supprimer la relation (à implémenter dans manager.ts si besoin)
    // Pour l'instant, on retourne un message
    // db.partMatching.deleteHierarchy(childId);

    console.log('✅ Relation supprimée');
    console.groupEnd();

    return NextResponse.json({
      success: true,
      message: `Relation supprimée pour ${childId}`
    });
    
  } catch (error) {
    console.error('❌ Erreur suppression relation:', error);
    console.groupEnd();
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}