import { NextRequest, NextResponse } from 'next/server';
import { hybridVisionSearch } from '@/ai/innovations/05-hybrid-vision-search';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;
    const textQuery = formData.get('textQuery') as string || '';
    
    if (!image && !textQuery) {
      return NextResponse.json({ error: 'Image ou requête texte requise' }, { status: 400 });
    }
    
    const db = getSQLiteCore();
    let result;
    
    if (image && textQuery) {
      // Recherche hybride (image + texte)
      const buffer = Buffer.from(await image.arrayBuffer());
      result = await hybridVisionSearch.search({ 
        imageBuffer: buffer, 
        textQuery 
      });
      // result = { results: [...], searchMode: 'hybrid', params: {...} }
    } else if (image) {
      // Recherche par image uniquement
      const buffer = Buffer.from(await image.arrayBuffer());
      const searchResults = await hybridVisionSearch.searchByImage(buffer);
      result = { results: searchResults, searchMode: 'vision' };
    } else {
      // Recherche par texte uniquement
      const searchResults = await hybridVisionSearch.searchByText(textQuery);
      result = { results: searchResults, searchMode: 'text' };
    }
    
    // Sauvegarder dans l'historique
    await db.recordMetric('hybrid_search', 'search_count', 1);
    await db.recordMetric('hybrid_search', 'results_count', result.results?.length || 0);
    
    return NextResponse.json({
      success: true,
      results: result.results || [],
      searchMode: result.searchMode || 'unknown',
      count: result.results?.length || 0
    });
  } catch (error: any) {
    console.error('Erreur hybrid-search:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}