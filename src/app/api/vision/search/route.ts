// app/api/vision/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { hybridVisionSearch } from '@/ai/innovations/05-hybrid-vision-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 120s max - augmenté pour supporter le pipeline complet (OCR + extraction features + recherche vectorielle)

// Interface pour la réponse enrichie
interface SearchMatch {
  id: string;
  similarity: number;
  metadata: {
    filename: string;
    description: string;
    tags: string[];
    folderId: string;
    date: string;
  };
  advancedDetails?: any;
}

interface EnhancedSearchResponse {
  found: boolean;
  bestMatch?: SearchMatch;      // Renommé de 'match' à 'bestMatch'
  match?: SearchMatch;          // Ajouté pour compatibilité frontend
  data?: {                      // Ajouté pour compatibilité frontend
    image: string;
    filename: string;
    date: string;
    location?: string;
    tags?: string[];
    equipmentType?: string;
    zone?: string;
    description?: string;
    ocrText?: string;
  };

  matches: SearchMatch[];
  searchMetadata?: {
    mode: 'vision' | 'text' | 'hybrid';
    durationMs: number;
    totalResults: number;
    filtersApplied?: string[];
  };
  confidence?: {
    score: number;
    level: 'high' | 'medium' | 'low';
    factors: Array<{ name: string; value: number; weight: number }>;
    recommendation: 'trust' | 'verify' | 'reject';
  };
  message?: string; // Message d'information (ex: "Aucune correspondance")
}


export async function POST(request: NextRequest) {
  console.group('🔍 RECHERCHE HYBRIDE PAR SIMILARITÉ');
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const imageId = formData.get('imageId') as string | null;
    const textQuery = formData.get('textQuery') as string | null;
    const threshold = formData.get('threshold') ? parseFloat(formData.get('threshold') as string) : 0.65; // Abaissé de 0.90 à 0.65 pour éviter fallback lent

    const filterFolder = formData.get('filterFolder') as string | null;
    const filterTags = formData.get('filterTags') ? JSON.parse(formData.get('filterTags') as string) : null;
    const visionWeight = formData.get('visionWeight') ? parseFloat(formData.get('visionWeight') as string) : 0.6;
    const textWeight = formData.get('textWeight') ? parseFloat(formData.get('textWeight') as string) : 0.4;

    console.log('📸 Image reçue:', imageFile?.name || 'aucune');
    console.log('📝 Requête texte:', textQuery || 'aucune');
    console.log('🎚️ Seuil similarité:', threshold);
    console.log('📁 Filtre dossier:', filterFolder || 'aucun');
    console.log('🏷️ Filtre tags:', filterTags || 'aucun');
    console.log('⚖️ Poids vision/texte:', `${visionWeight}/${textWeight}`);

    // Cas 1: Recherche par ID d'image existant
    if (imageId) {
      console.log('🆔 Mode: Recherche par ID d\'image existant:', imageId);
      
      const results = await hybridVisionSearch.searchSimilarById(imageId, {
        threshold,
        maxResults: 20
      });

      const matches: SearchMatch[] = results.map(r => ({
        id: r.id,
        similarity: r.combinedScore,
        metadata: {
          filename: r.metadata.filename,
          description: r.metadata.description,
          tags: r.metadata.tags,
          folderId: r.metadata.folderId,
          date: r.metadata.date
        },
        advancedDetails: (r as any).advancedDetails
      }));

      const response: EnhancedSearchResponse = {
        found: matches.length > 0,
        matches,
        searchMetadata: {
          mode: 'vision',
          durationMs: Date.now() - startTime,
          totalResults: matches.length
        },
        message: matches.length === 0 ? "Aucune correspondance trouvée" : undefined
      };


      if (matches.length > 0) {
        response.bestMatch = matches[0];
        
        try {
          const { default: visionService } = await import('@/lib/services/visionService');
          const rawImageId = matches[0].id.replace(/^vision_/, '');
          const imageData = await visionService.getImageData(rawImageId);
          if (imageData && imageData.image) {
            response.match = matches[0];
            response.data = {
              image: imageData.image,
              filename: imageData.filename || matches[0].metadata.filename,
              date: matches[0].metadata.date || new Date().toISOString(),
              location: imageData.location || '',
              tags: matches[0].metadata.tags || [],
              equipmentType: (imageData as any).equipmentType || '',
              zone: (imageData as any).zone || '',
              description: matches[0].metadata.description || '',
              ocrText: (imageData as any).ocr_text || (imageData as any).ocrText || ''
            };

          }
        } catch (e) {
          console.error('[VisionSearch] Erreur récupération image:', e);
        }
      }

      console.log(`📊 Résultat par ID: ${matches.length} trouvés`);
      console.groupEnd();
      return NextResponse.json(response);
    }

    // Cas 2: Recherche par texte uniquement
    if (!imageFile && textQuery) {
      console.log('🔤 Mode: Recherche textuelle uniquement');
      
      const results = await hybridVisionSearch.searchByText(textQuery, {
        maxResults: 20,
        filterFolder: filterFolder || undefined
      });

      const matches: SearchMatch[] = results.map(r => ({
        id: r.id,
        similarity: r.combinedScore,
        metadata: {
          filename: r.metadata.filename,
          description: r.metadata.description,
          tags: r.metadata.tags,
          folderId: r.metadata.folderId,
          date: r.metadata.date
        },
        advancedDetails: (r as any).advancedDetails
      }));

      const response: EnhancedSearchResponse = {
        found: matches.length > 0,
        matches,
        searchMetadata: {
          mode: 'text',
          durationMs: Date.now() - startTime,
          totalResults: matches.length
        },
        message: matches.length === 0 ? "Aucune correspondance trouvée" : undefined
      };


      // Ajouter le bestMatch si trouvé
      if (matches.length > 0) {
        response.bestMatch = matches[0];
        
        // Ajouter le score de confiance
        const { confidenceFeedback } = await import('@/ai/innovations/08-confidence-feedback');
        response.confidence = confidenceFeedback.calculateSearchConfidence(
          matches[0].similarity,
          matches.length,
          matches[0].similarity,
          matches[1]?.similarity || 0
        );

        try {
          const { default: visionService } = await import('@/lib/services/visionService');
          const rawImageId = matches[0].id.replace(/^vision_/, '');
          const imageData = await visionService.getImageData(rawImageId);
          if (imageData && imageData.image) {
            response.match = matches[0];
            response.data = {
              image: imageData.image,
              filename: imageData.filename || matches[0].metadata.filename,
              date: matches[0].metadata.date || new Date().toISOString(),
              location: imageData.location || '',
              tags: matches[0].metadata.tags || [],
              equipmentType: (imageData as any).equipmentType || '',
              zone: (imageData as any).zone || '',
              description: matches[0].metadata.description || '',
              ocrText: (imageData as any).ocr_text || (imageData as any).ocrText || ''
            };

          }
        } catch (e) {
          console.error('[VisionSearch] Erreur récupération image:', e);
        }
      }

      console.log(`📊 Résultat textuel: ${matches.length} trouvés`);
      console.groupEnd();
      return NextResponse.json(response);
    }

    // Cas 2: Recherche par image uniquement ou hybride
    if (!imageFile) {
      console.log('❌ Aucune image reçue et aucune requête texte');
      console.groupEnd();
      return NextResponse.json(
        { error: 'Image ou requête texte requise' },
        { status: 400 }
      );
    }

    // Vérifier le type de fichier
    if (!imageFile.type.startsWith('image/')) {
      console.log('❌ Type de fichier non supporté:', imageFile.type);
      console.groupEnd();
      return NextResponse.json(
        { error: 'Format d\'image non supporté' },
        { status: 400 }
      );
    }

    // Sauvegarder temporairement
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const tempPath = join(tmpdir(), `vision-${Date.now()}.jpg`);
    await writeFile(tempPath, buffer);

    try {
      let searchResult;
      let searchMode: 'vision' | 'text' | 'hybrid' = 'vision';
      
      // Cas 2a: Recherche hybride (image + texte)
      if (textQuery) {
        console.log('🔀 Mode: Recherche hybride (image + texte)');
        
        const result = await hybridVisionSearch.search({
          imageBuffer: buffer,
          textQuery,
          visionWeight,
          textWeight,
          threshold,
          maxResults: 20,
          filterFolder: filterFolder || undefined,
          filterTags: filterTags || undefined
        });
        
        searchResult = result;
        searchMode = result.searchMode;
      } 
      // Cas 2b: Recherche par image uniquement
      else {
        console.log('🖼️ Mode: Recherche par image uniquement');
        
        const results = await hybridVisionSearch.searchByImage(buffer, {
          threshold,
          maxResults: 20
        });
        
        searchResult = { results, searchMode: 'vision' as const };
        searchMode = 'vision';

        // Si aucun résultat, tenter un fallback direct vers ChromaDB (recherche vectorielle)
        if ((!results || results.length === 0)) {
          try {
            console.log('[VisionSearch] Aucun résultat hybrid — tentative fallback ChromaDB');
            const { default: visionService } = await import('@/lib/services/visionService');
            const chromaModule = await import('@/ai/vector/chromadb-manager');
            const chroma = chromaModule.ChromaDBManager.getInstance();

            // Extraire features (sans classifier) pour requête vectorielle
            const features = await visionService.extractFeatures(buffer);
            if (features && features.length > 0) {
              const chromaResults = await chroma.searchSimilar('VISION', features, 20);
              if (chromaResults && chromaResults.length > 0) {
                // Map chroma results to HybridSearchResult-like structure
                const mapped = chromaResults.map((c: any) => {
                  // Chroma may return different shapes: {id, score}, {id, similarity}, or {ids, distances}
                  let score = 0;
                  if (typeof c.score === 'number') score = c.score;
                  else if (typeof c.similarity === 'number') score = c.similarity;
                  else if (typeof c.distance === 'number') score = Math.max(0, 1 - c.distance);

                  // Some providers return distances in [0,2] for cosine; clamp
                  if (score > 1) score = 1;
                  if (score < 0) score = 0;

                  return {
                    id: c.id,
                    combinedScore: score,
                    metadata: c.metadata || {}
                  };
                });
                searchResult = { results: mapped, searchMode: 'vision' as const };
                searchMode = 'vision';
              }
            }
          } catch (chErr) {
            console.warn('[VisionSearch] Fallback ChromaDB échoué:', chErr);
          }
        }
      }
      
      const matches: SearchMatch[] = searchResult.results.map(r => ({
        id: r.id,
        similarity: r.combinedScore,
        metadata: {
          filename: r.metadata.filename,
          description: r.metadata.description,
          tags: r.metadata.tags,
          folderId: r.metadata.folderId,
          date: r.metadata.date
        },
        advancedDetails: (r as any).advancedDetails
      }));

      const response: EnhancedSearchResponse = {
        found: matches.length > 0,
        matches,
        searchMetadata: {
          mode: searchMode,
          durationMs: Date.now() - startTime,
          totalResults: matches.length
        },
        message: matches.length === 0 ? "Aucune correspondance trouvée" : undefined
      };


      // Ajouter le bestMatch si trouvé
      if (matches.length > 0) {
        response.bestMatch = matches[0];
        
        // Ajouter les scores de confiance
        const { confidenceFeedback } = await import('@/ai/innovations/08-confidence-feedback');
        const secondBest = matches.length > 1 ? matches[1].similarity : 0;
        
        response.confidence = confidenceFeedback.calculateSearchConfidence(
          matches[0].similarity,
          matches.length,
          matches[0].similarity,
          secondBest
        );
      }

      // Appliquer le seuil minimum si nécessaire
      if (threshold > 0) {
        const filteredMatches = matches.filter(m => m.similarity >= threshold);
        response.matches = filteredMatches;
        response.found = filteredMatches.length > 0;
        if (response.bestMatch && response.bestMatch.similarity < threshold) {
          response.bestMatch = filteredMatches[0] || undefined;
        }
      }

      // NOUVEAU: Récupérer les données de l'image (base64) pour le composant UI
      if (response.found && response.matches.length > 0) {
        const bestMatch = response.matches[0];
        try {
          const { default: visionService } = await import('@/lib/services/visionService');
          const rawImageId = bestMatch.id.replace(/^vision_/, '');
          const imageData = await visionService.getImageData(rawImageId);
          
          if (imageData && imageData.image) {
            response.match = bestMatch;
            response.data = {
              image: imageData.image,
              filename: bestMatch.metadata.filename || 'image.jpg',
              date: bestMatch.metadata.date || new Date().toISOString(),
              tags: bestMatch.metadata.tags || [],
              description: bestMatch.metadata.description || '',
              location: imageData.location || '',
              equipmentType: (imageData as any).equipmentType || '',
              zone: (imageData as any).zone || '',
              ocrText: (imageData as any).ocr_text || (imageData as any).ocrText || ''
            };

          } else {
            console.warn(`[VisionSearch] Impossible de récupérer l'image pour ${bestMatch.id}`);
          }
        } catch (err) {
          console.error('[VisionSearch] Erreur récupération image:', err);
        }
      }

      console.log(`📊 Résultat: ${response.found ? '✅ Trouvé' : '❌ Non trouvé'}`);
      if (response.bestMatch) {
        console.log(`   Similarité: ${Math.round(response.bestMatch.similarity * 100)}%`);
        console.log(`   ID: ${response.bestMatch.id}`);
        if (response.confidence) {
          console.log(`   Confiance: ${Math.round(response.confidence.score * 100)}% (${response.confidence.level})`);
        }
      }
      if (response.searchMetadata) {
        console.log(`   Mode: ${response.searchMetadata.mode}`);
        console.log(`   Durée: ${response.searchMetadata.durationMs}ms`);
      }

      console.groupEnd();
      return NextResponse.json(response);
      
    } finally {
      // Nettoyer fichier temporaire
      await unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    console.error('❌ Erreur recherche:', error);
    console.groupEnd();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}