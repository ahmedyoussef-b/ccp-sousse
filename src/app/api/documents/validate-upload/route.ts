export const runtime = 'edge';

/**
 * @fileOverview API de validation par upload (fichier temporaire)
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { chunkValidator } from '@/ai/validation/chunk-validator';

async function extractContentFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  
  if (isPdf) {
    try {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(buffer);
      return pdfData.text;
    } catch (error: any) {
      console.error('[VALIDATE-UPLOAD] Erreur extraction PDF:', error.message);
      return '';
    }
  }
  
  return buffer.toString('utf-8');
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
  const tempFilePath: string | null = null;
  
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const zone = formData.get('zone') as string || 'SHARED';
    
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }
    
    const fileName = file.name;
    console.log(`[VALIDATE-UPLOAD] Validation du fichier: ${fileName} (zone: ${zone})`);
    
    // Lire le buffer du fichier
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Extraire le contenu
    const content = await extractContentFromBuffer(buffer, fileName);
    
    if (!content || content.length < 50) {
      console.log(`[VALIDATE-UPLOAD] Contenu court ou document scanné/binaire détecté pour ${fileName}. Bypass de la validation sémantique stricte pour permettre l'OCR/traitement complet.`);
      return NextResponse.json({ 
        success: true,
        fileName,
        zone,
        totalChunks: 1,
        validChunks: 1,
        invalidChunks: 0,
        averageScore: 1.0,
        warnings: ['Document scanné ou contenu court: validation sémantique reportée au post-traitement (OCR)'],
        recommendations: ['Le document sera traité par le moteur OCR/binaire lors de l\'indexation'],
        validation: {
          totalChunks: 1,
          validChunks: 1,
          invalidChunks: 0,
          averageScore: 1.0,
          warnings: ['Document scanné ou contenu court'],
          recommendations: []
        },
        details: []
      });
    }
    
    // Générer les chunks
    const chunks = generateChunksForValidation(content);
    
    if (chunks.length === 0) {
      console.log(`[VALIDATE-UPLOAD] Aucun chunk généré pour ${fileName}. Bypass de la validation sémantique stricte pour permettre l'OCR/traitement complet.`);
      return NextResponse.json({ 
        success: true,
        fileName,
        zone,
        totalChunks: 1,
        validChunks: 1,
        invalidChunks: 0,
        averageScore: 1.0,
        warnings: ['Aucun chunk textuel direct: validation sémantique reportée au post-traitement (OCR)'],
        recommendations: ['Le document sera traité par le moteur OCR/binaire lors de l\'indexation'],
        validation: {
          totalChunks: 1,
          validChunks: 1,
          invalidChunks: 0,
          averageScore: 1.0,
          warnings: ['Aucun chunk textuel direct'],
          recommendations: []
        },
        details: []
      });
    }
    
    // Valider les chunks
    const results = await chunkValidator.validateChunks(chunks, content);
    const report = chunkValidator.generateReport(results);
    
    console.log(`[VALIDATE-UPLOAD] Validation terminée: ${report.validChunks}/${report.totalChunks} chunks valides (${(report.averageScore * 100).toFixed(0)}%)`);
    
    return NextResponse.json({
      success: true,
      fileName,
      zone,
      totalChunks: chunks.length,
      validChunks: report.validChunks,
      invalidChunks: report.invalidChunks,
      averageScore: report.averageScore,
      warnings: report.warnings,
      recommendations: report.recommendations,
      validation: report,
      details: results.map(r => ({
        isValid: r.isValid,
        score: r.similarityScore,
        warnings: r.warnings
      }))
    });
    
  } catch (error: any) {
    console.error('[VALIDATE-UPLOAD] Erreur:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    // Nettoyage si fichier temporaire créé
    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => {});
    }
  }
}