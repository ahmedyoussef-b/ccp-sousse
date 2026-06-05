// src/app/api/circuit-mindmap/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mindMapParser } from '@/ai/mindmap/mindmap-parser';
import { mindMapManager } from '@/ai/mindmap/mindmap-manager';
import { mindMapEmbedder } from '@/ai/mindmap/mindmap-embedder';
import { mindMapCache } from '@/ai/mindmap/mindmap-cache';
import { parseSvgToMindMap, parsePngToMindMap } from '@/ai/mindmap/mindmap-image-reader';
import type { MindMapData } from '@/ai/mindmap/types';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB (images can be larger)

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // ─── Branch 1: Multipart FormData (SVG / PNG upload) ─────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const circuitId = formData.get('circuitId') as string;
      const file = formData.get('file') as File | null;

      if (!circuitId || !file) {
        return NextResponse.json(
          { success: false, error: 'circuitId et file sont requis.' },
          { status: 400 }
        );
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        return NextResponse.json(
          { success: false, error: `Fichier trop volumineux (max 10 Mo). Taille reçue: ${(file.size / 1024 / 1024).toFixed(1)} Mo.` },
          { status: 400 }
        );
      }

      const fileName = file.name.toLowerCase();
      let parsedData: MindMapData;

      // ── SVG ────────────────────────────────────────────────────────────
      if (fileName.endsWith('.svg')) {
        const svgContent = await file.text();
        parsedData = parseSvgToMindMap(svgContent);

      // ── PNG / JPG / WEBP (Vision IA) ───────────────────────────────────
      } else if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp')) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type || 'image/png';
        parsedData = await parsePngToMindMap(base64, mimeType);

      } else {
        return NextResponse.json(
          { success: false, error: 'Format de fichier non pris en charge. Utilisez : SVG, PNG, JPG ou WEBP.' },
          { status: 400 }
        );
      }

      if (!parsedData.nodes || parsedData.nodes.length === 0) {
        return NextResponse.json(
          { success: false, error: "Aucun nœud détecté dans l'image. Vérifiez que l'image contient bien un Mind Map lisible." },
          { status: 400 }
        );
      }

      const savedMindmap = await mindMapManager.saveMindMap(
        circuitId,
        parsedData,
        null,
        { source: 'image-upload', filename: file.name, timestamp: Date.now() }
      );

      await mindMapEmbedder.vectorizeMindMap(savedMindmap);
      mindMapCache.invalidate(`mindmap:${circuitId}`);

      return NextResponse.json({
        success: true,
        message: `Mind Map extrait depuis ${fileName} et sauvegardé avec succès (${parsedData.nodes.length} nœuds détectés).`,
        mindmap: savedMindmap,
        stats: { nodesDetected: parsedData.nodes.length, edgesDetected: parsedData.edges.length }
      });
    }

    // ─── Branch 2: JSON body (texte : Mermaid / Markdown / JSON) ─────────
    const rawBody = await request.text();

    if (Buffer.byteLength(rawBody, 'utf-8') > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { success: false, error: 'La taille du fichier dépasse la limite autorisée de 10 Mo.' },
        { status: 400 }
      );
    }

    const { circuitId, content, format, metadata } = JSON.parse(rawBody);

    if (!circuitId || !content) {
      return NextResponse.json(
        { success: false, error: 'circuitId et content sont requis.' },
        { status: 400 }
      );
    }

    const sanitizedContent = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim();

    let parsedData: MindMapData;

    if (format === 'json') {
      // 1. D'abord le parser local (fiable, déterministe, ne modifie pas les données)
      parsedData = mindMapParser.parse(sanitizedContent, format);
      
      // 2. Si le parser local échoue (0 nœud), fallback sur l'IA
      if (!parsedData || !parsedData.nodes || parsedData.nodes.length === 0) {
        console.warn("[API-MINDMAP-UPLOAD] ⚠️ Le parser local n'a trouvé aucun nœud, tentative avec l'IA...");
        try {
          const { parseTextWithAI } = await import('@/ai/mindmap/mindmap-text-ai-parser');
          parsedData = await parseTextWithAI(sanitizedContent, format);
        } catch (err) {
          console.warn("[API-MINDMAP-UPLOAD] ⚠️ Échec de l'analyse IA du JSON également.", err);
        }
      }
    } else {
      // Mermaid, Markdown → parser local uniquement
      parsedData = mindMapParser.parse(sanitizedContent, format);
    }

    if (!parsedData || !parsedData.nodes || parsedData.nodes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Le contenu fourni est vide, non structuré ou au format incompatible.' },
        { status: 400 }
      );
    }

    const savedMindmap = await mindMapManager.saveMindMap(
      circuitId,
      parsedData,
      null,
      metadata || { source: 'upload', format: format || 'detected', timestamp: Date.now() }
    );

    await mindMapEmbedder.vectorizeMindMap(savedMindmap);
    mindMapCache.invalidate(`mindmap:${circuitId}`);

    return NextResponse.json({
      success: true,
      message: 'Mind Map importé, sauvegardé et vectorisé avec succès.',
      mindmap: savedMindmap
    });

  } catch (error) {
    console.error("[API-MINDMAP-UPLOAD] ❌ Erreur lors de l'upload:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}