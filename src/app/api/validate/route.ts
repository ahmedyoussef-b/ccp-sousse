export const runtime = 'edge';

/**
 * @fileOverview API de validation des chunks sans indexation
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { chunkValidator } from '@/ai/validation/chunk-validator';
import fs from 'fs';
import path from 'path';

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
  
  return fs.readFileSync(filePath, 'utf-8');
}

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

export async function POST(req: NextRequest) {
  try {
    const { filePath, zone } = await req.json();
    
    if (!filePath) {
      return NextResponse.json({ error: 'Chemin de fichier manquant' }, { status: 400 });
    }
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 });
    }
    
    const fileName = path.basename(filePath);
    console.log(`[VALIDATE] Validation du fichier: ${fileName}`);
    
    // Extraire le contenu
    const content = await extractContentForValidation(filePath);
    
    if (!content || content.length < 50) {
      return NextResponse.json({ 
        error: 'Contenu du fichier trop court ou illisible',
        contentLength: content?.length || 0
      }, { status: 422 });
    }
    
    // Générer les chunks
    const chunks = generateChunksForValidation(content);
    
    if (chunks.length === 0) {
      return NextResponse.json({ 
        error: 'Aucun chunk généré',
        recommendation: 'Le contenu du fichier est peut-être trop court ou mal formaté'
      }, { status: 422 });
    }
    
    // Valider les chunks
    const results = await chunkValidator.validateChunks(chunks, content);
    const report = chunkValidator.generateReport(results);
    
    return NextResponse.json({
      success: true,
      fileName,
      zone: zone || 'auto',
      totalChunks: chunks.length,
      validChunks: report.validChunks,
      invalidChunks: report.invalidChunks,
      averageScore: report.averageScore,
      warnings: report.warnings,
      recommendations: report.recommendations,
      details: results.map(r => ({
        isValid: r.isValid,
        score: r.similarityScore,
        warnings: r.warnings
      }))
    });
    
  } catch (error: any) {
    console.error('[VALIDATE] Erreur:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}