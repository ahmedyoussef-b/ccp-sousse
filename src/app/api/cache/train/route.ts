import { NextResponse } from 'next/server';
import { SQLiteCore } from '@/ai/core/sqlite/manager';
import { localEmbeddingService } from '@/ai/cache/local-embeddings';
import { compressionEngine } from '@/ai/cache/compression-engine';

/**
 * Route pour entraîner l'autoencodeur DragonMemory
 */
export async function POST() {
  try {
    const sqlite = SQLiteCore.getInstance();
    
    // 1. Récupérer des échantillons de requêtes pour l'entraînement
    // On peut utiliser les requêtes du cache sémantique
    const entries = sqlite.semanticCache.getAll();
    
    if (entries.length < 10) {
      return NextResponse.json({ 
        success: false, 
        message: "Pas assez de données pour l'entraînement (min 10 entrées)." 
      }, { status: 400 });
    }

    console.log(`[API][CACHE] 🎓 Démarrage de l'entraînement DragonMemory sur ${entries.length} entrées...`);
    
    const trainingData: number[][] = [];
    
    for (const entry of entries) {
      const cacheItem = sqlite.semanticCache.get(entry.id);
      if (cacheItem && cacheItem.query) {
        const rawEmbedding = await localEmbeddingService.generate(cacheItem.query);
        trainingData.push(rawEmbedding);
      }
    }

    // 2. Lancer l'entraînement
    await compressionEngine.train(trainingData);

    return NextResponse.json({
      success: true,
      message: `Modèle DragonMemory entraîné avec succès sur ${trainingData.length} exemples.`,
      compressionRatio: "384 -> 64 (6x)"
    });

  } catch (error: any) {
    console.error("[API][CACHE] Erreur entraînement:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
