export const runtime = 'edge';

// app/api/training/rag-index/route.ts
// API pour indexer le dataset de Collecte Manuelle de Q/R dans ChromaDB (RAG)

import { NextResponse } from 'next/server';
import { readAllExamples } from '../examples/store';
import { chromaDBManager } from '@/ai/vector/chromadb-manager';
import { getRelevantZones, ZONES_CONFIG, ZoneType } from '@/ai/vector/chromadb-schema';

export async function POST() {
  try {
    const examples = readAllExamples();
    if (!examples || examples.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        indexedCount: 0,
        message: 'Aucun exemple à indexer.'
      });
    }

    // 1. Initialiser ChromaDB
    await chromaDBManager.initialize();

    // 2. Nettoyer les anciennes Q/R manuelles dans toutes les collections
    const zoneKeys = Object.keys(ZONES_CONFIG) as ZoneType[];
    let deletedCount = 0;

    for (const zone of zoneKeys) {
      try {
        const existing = await chromaDBManager.getDocumentsByFilter(zone, { source: 'collecte_manuelle' });
        if (existing && existing.ids && existing.ids.length > 0) {
          await chromaDBManager.deleteDocuments(zone, existing.ids);
          deletedCount += existing.ids.length;
        }
      } catch (err) {
        console.error(`[RAG-INDEX] Erreur lors du nettoyage de la zone ${zone}:`, err);
      }
    }

    // 3. Indexer les Q/R actuelles
    let indexedCount = 0;
    const zoneDistribution: Record<string, number> = {};

    for (const example of examples) {
      // Trouver la zone la plus appropriée (classification dynamique)
      const searchText = `${example.question} ${example.response} ${example.context || ''}`;
      const relevantZones = getRelevantZones(searchText);
      const targetZone = (relevantZones && relevantZones.length > 0) ? relevantZones[0] : 'SHARED';

      const docId = `manual_qa_${example.id}`;
      const docContent = `Question: ${example.question}\nRéponse: ${example.response}`;
      const docMetadata = {
        id: docId,
        titre: `Q/R: ${example.question.substring(0, 100)}`,
        type: 'manual_qa',
        categorie: 'training_qa',
        source: 'collecte_manuelle',
        zone: targetZone,
        tags: example.tags || [],
        date_creation: example.createdAt,
        date_modification: example.updatedAt || example.createdAt
      };

      try {
        await chromaDBManager.upsertDocuments(targetZone, [{
          id: docId,
          content: docContent,
          metadata: docMetadata
        }]);

        indexedCount++;
        zoneDistribution[targetZone] = (zoneDistribution[targetZone] || 0) + 1;
      } catch (err) {
        console.error(`[RAG-INDEX] Erreur lors de l'indexation dans ${targetZone}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      indexedCount,
      zoneDistribution
    });

  } catch (error) {
    console.error('[API][RAG-INDEX] Erreur critique:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne de synchronisation' },
      { status: 500 }
    );
  }
}
