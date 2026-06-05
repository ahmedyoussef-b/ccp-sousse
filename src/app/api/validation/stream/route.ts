/**
 * @fileOverview API SSE pour la validation des chunks en temps réel
 * @version 1.0.0
 */

import { NextRequest } from 'next/server';
import { chunkValidator, ChunkValidationProgress } from '@/ai/validation/chunk-validator';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function extractContentForValidation(filePath: string): Promise<string> {
  const isPdf = filePath.toLowerCase().endsWith('.pdf');
  
  if (isPdf) {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    } catch (error: any) {
      console.error('[VALIDATION-STREAM] Erreur extraction PDF:', error.message);
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

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path');
  const fileName = req.nextUrl.searchParams.get('doc');

  if (!filePath && !fileName) {
    return new Response(
      JSON.stringify({ error: 'Missing file path or name' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let actualPath = filePath;
        let actualFileName = fileName;

        if (!actualPath && actualFileName) {
          // Rechercher le fichier (simplifié)
          const basePath = path.join(process.cwd(), 'data', 'centrale_documents');
          // Logique de recherche simplifiée
          actualPath = path.join(basePath, 'SHARED', actualFileName);
          if (!fs.existsSync(actualPath)) {
            throw new Error(`Fichier non trouvé: ${actualFileName}`);
          }
        }

        if (!actualPath || !fs.existsSync(actualPath)) {
          throw new Error(`Fichier non trouvé: ${actualPath}`);
        }

        actualFileName = path.basename(actualPath);
        console.log(`[VALIDATION-STREAM] Début validation: ${actualFileName}`);

        const content = await extractContentForValidation(actualPath);
        
        if (!content || content.length < 50) {
          throw new Error('Contenu du fichier trop court ou illisible');
        }

        const chunks = generateChunksForValidation(content);
        console.log(`[VALIDATION-STREAM] ${chunks.length} chunks générés`);

        const initialProgress: ChunkValidationProgress = {
          totalChunks: chunks.length,
          processedChunks: 0,
          currentChunkIndex: -1,
          currentScore: 0,
          status: 'pending',
          results: []
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialProgress)}\n\n`));

        const results = await chunkValidator.validateChunks(chunks, content, (progress) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
        });

        const report = chunkValidator.generateReport(results);

        const finalProgress: ChunkValidationProgress = {
          totalChunks: chunks.length,
          processedChunks: chunks.length,
          currentChunkIndex: chunks.length - 1,
          currentScore: report.averageScore,
          status: 'completed',
          results
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...finalProgress, report })}\n\n`));
        controller.close();

        console.log(`[VALIDATION-STREAM] Validation terminée: ${report.validChunks}/${report.totalChunks} chunks valides`);

      } catch (error: any) {
        console.error('[VALIDATION-STREAM] Erreur:', error);
        const errorData = {
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    },
  });
}