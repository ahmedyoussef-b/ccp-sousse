export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { DocumentProcessor } from '@/lib/document-manager/document-processor';
import { ZoneType, ZONES_CONFIG } from '@/ai/vector/chromadb-schema';
import { chunkValidator } from '@/ai/validation/chunk-validator';
import fs from 'fs';
import path from 'path';

// ============================================================================
// FONCTIONS D'EXTRACTION POUR VALIDATION
// ============================================================================

/**
 * Extrait le contenu texte d'un fichier pour la validation
 */
async function extractContentForValidation(filePath: string): Promise<string> {
  const isPdf = filePath.toLowerCase().endsWith('.pdf');
  
  if (isPdf) {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    } catch (error: any) {
      console.error('[VALIDATE] Erreur extraction PDF:', error.message);
      return '';
    }
  }
  
  // Fichiers texte
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Génère des chunks à partir du contenu pour validation
 */
function generateChunksForValidation(content: string, chunkSize: number = 1000): string[] {
  if (!content) return [];
  
  const chunks: string[] = [];
  const sentences = content.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= chunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  
  return chunks;
}

// ============================================================================
// API ROUTE
// ============================================================================

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let validationReport = null;
  
  try {
    const { filePath, zone, type, collection, validateOnly = false, skipValidation = false } = await req.json();
    
    if (!filePath) {
      return NextResponse.json({ error: 'Chemin de fichier manquant' }, { status: 400 });
    }
    
    // Vérifier que le fichier existe
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `Fichier non trouvé: ${filePath}` }, { status: 404 });
    }
    
    // Vérifier que la zone est valide si elle est fournie
    if (zone && !ZONES_CONFIG[zone as ZoneType]) {
      return NextResponse.json({ 
        error: `Zone invalide: ${zone}. Zones valides: ${Object.keys(ZONES_CONFIG).join(', ')}` 
      }, { status: 400 });
    }
    
    const fileName = path.basename(filePath);
    console.log(`[API][VECTORIZE] Traitement: ${fileName} (zone: ${zone || 'auto'}, type: ${type || 'auto'})`);
    
    // ============================================
    // 🔥 PHASE 1 : VALIDATION DES CHUNKS (sauf si skipValidation)
    // ============================================
    
    let validChunksIndices: number[] | null = null;
    
    if (!skipValidation) {
      console.log(`[API][VECTORIZE] 🔍 Phase 1: Validation du document...`);
      
      // 1. Extraire le contenu du fichier
      const content = await extractContentForValidation(filePath);
      
      if (!content || content.length < 50) {
        return NextResponse.json({ 
          error: 'Contenu du fichier trop court ou illisible',
          contentLength: content?.length || 0,
          recommendation: 'Vérifiez que le fichier contient du texte exploitable (PDF scanné ?)'
        }, { status: 422 });
      }
      
      // 2. Générer les chunks
      const chunks = generateChunksForValidation(content);
      console.log(`[API][VECTORIZE] 📊 ${chunks.length} chunks générés pour validation`);
      
      if (chunks.length === 0) {
        return NextResponse.json({ 
          error: 'Aucun chunk généré à partir du contenu',
          recommendation: 'Le contenu du fichier est peut-être trop court ou mal formaté'
        }, { status: 422 });
      }
      
      // 3. Valider les chunks
      console.log(`[API][VECTORIZE] 🔬 Validation de ${chunks.length} chunks...`);
      const validationStart = Date.now();
      
      const validationResults = await chunkValidator.validateChunks(chunks, content);
      validationReport = chunkValidator.generateReport(validationResults);
      
      const validationTime = Date.now() - validationStart;
      console.log(`[API][VECTORIZE] ✅ Validation terminée: ${validationReport.validChunks}/${validationReport.totalChunks} chunks valides (${(validationReport.averageScore * 100).toFixed(0)}%) en ${validationTime}ms`);
      
      if (validationReport.warnings.length > 0) {
        console.warn(`[API][VECTORIZE] ⚠️ Validations warnings:`, validationReport.warnings);
      }
      
      // 4. Si aucun chunk valide, refuser l'indexation
      if (validationReport.validChunks === 0) {
        return NextResponse.json({ 
          success: false,
          error: 'Aucun chunk valide détecté. Indexation refusée.',
          validation: validationReport,
          recommendations: validationReport.recommendations,
          details: validationResults.map(r => ({
            isValid: r.isValid,
            score: r.similarityScore,
            warnings: r.warnings
          }))
        }, { status: 422 });
      }
      
      // 5. Mode validateOnly : retourner les résultats sans indexer
      if (validateOnly) {
        return NextResponse.json({ 
          success: true,
          validateOnly: true,
          validation: validationReport,
          details: validationResults.map(r => ({
            isValid: r.isValid,
            score: r.similarityScore,
            warnings: r.warnings
          }))
        });
      }
      
      // 6. Récupérer les indices des chunks valides
      validChunksIndices = validationResults
        .map((r, i) => ({ valid: r.isValid, index: i }))
        .filter(r => r.valid)
        .map(r => r.index);
      
      console.log(`[API][VECTORIZE] 📝 Indexation de ${validChunksIndices.length} chunks valides sur ${chunks.length}`);
    }
    
    // ============================================
    // PHASE 2 : INDEXATION (avec filtrage optionnel)
    // ============================================
    
    console.log(`[API][VECTORIZE] 🚀 Phase 2: Indexation du document...`);
    
    const processor = new DocumentProcessor((stage, percent, detail) => {
      console.log(`[PIPELINE][${percent}%] ${stage} ${detail || ''}`);
    });

    // Appel avec options (zone, type, et filtrage des chunks)
    const result = await processor.processDocument(filePath, { 
      zone, 
      documentType: type, 
      collection,
      validChunksOnly: validChunksIndices || undefined // ← Filtrer les chunks invalides
    });
    
    const processingTime = Date.now() - startTime;
    
    console.log(`[API][VECTORIZE] ✅ Indexation terminée: ${result.chunksCount} chunks indexés en ${processingTime}ms`);
    
    return NextResponse.json({ 
      success: true, 
      message: validationReport 
        ? `Traitement terminé. ${validationReport.validChunks}/${validationReport.totalChunks} chunks indexés.`
        : `Traitement terminé. ${result.chunksCount} chunks indexés.`,
      validation: validationReport,
      processingTime,
      chunksCount: result.chunksCount
    });
    
  } catch (error: any) {
    console.error('[API][VECTORIZE] Échec du traitement:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || String(error),
      validation: validationReport,
      recommendation: 'Vérifiez les logs serveur pour plus de détails'
    }, { status: 500 });
  }
}