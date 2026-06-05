import { NextRequest, NextResponse } from 'next/server';
/**
 * @fileOverview Ingest API Route - Phase 1 de l'Architecture Elite 32.
 * Orchestre le pipeline complet d'intégration documentaire avec protection contre les timeouts.
 */
import { ingestDocument } from '@/ai/flows/ingest-document-flow';
import { implicitRL } from '@/ai/learning/implicit-rl';

export const maxDuration = 60; // Limite Next.js maximale

export async function POST(req: NextRequest) {
  console.group("[API][INGEST] Pipeline Ingest");

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file || !(file instanceof File)) {
      console.error("[API][INGEST] Fichier manquant ou invalide");
      return NextResponse.json({ error: "Aucun fichier valide n'a été détecté." }, { status: 400 });
    }

    console.log(`[API][INGEST] Fichier: ${file.name} | Taille: ${(file.size / 1024).toFixed(2)} KB`);

    const text = await file.text().catch(() => {
      throw new Error("Impossible de lire le texte du fichier.");
    });
    
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Le fichier est vide." }, { status: 400 });
    }

    // Exécution du flux avec une marge de sécurité par rapport au timeout 504
    const result = await ingestDocument({
      fileName: file.name,
      fileContent: text,
      fileType: file.type
    });

    console.log(`[API][INGEST] Succès | Doc ID: ${result.docId} | Concepts: ${result.concepts.length}`);

    // Mise à jour asynchrone du profil (non bloquante pour la réponse)
    implicitRL.processSignal('USAGE', { 
      isTechnical: result.concepts.length > 3,
      modelUsed: result.embeddingModel 
    }).catch(() => {});

    console.groupEnd();
    return NextResponse.json({
      success: true,
      documentId: result.docId,
      metadata: {
        filename: file.name,
        size: file.size,
        type: file.type,
        processedAt: result.processedAt
      },
      stats: {
        chunks: result.chunks,
        conceptsIdentified: result.concepts.length,
        embeddingModel: result.embeddingModel
      },
      hierarchy: result.hierarchy,
      suggestions: generateSuggestions(file.name, result.concepts)
    });

  } catch (error: any) {
    console.error("[API][INGEST] Erreur fatale:", error.message);
    console.groupEnd();
    return NextResponse.json({ 
      error: "Le service d'ingestion est temporairement surchargé. Veuillez réessayer avec un fichier plus petit.",
      details: error.message 
    }, { status: 500 });
  }
}

function generateSuggestions(filename: string, concepts: string[]): string[] {
  const base = [`Analyse ${filename}.`, `Points critiques de ${filename}.`];
  if (concepts && concepts.length > 0) base.push(`Explique ${concepts[0]}.`);
  return base;
}
