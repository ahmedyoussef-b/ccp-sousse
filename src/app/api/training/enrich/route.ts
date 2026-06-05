// src/app/api/training/enrich/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { question, enrichment, sourceFile } = await request.json();

    if (!question || !enrichment) {
      return NextResponse.json({ error: 'Question et enrichissement requis' }, { status: 400 });
    }

    console.log(`[ENRICH] 📝 Enrichissement pour "${question.substring(0, 30)}..." dans ${sourceFile || 'inconnu'}`);

    let targetPath = '';
    if (sourceFile) {
      // Chercher dans imports ou versions
      const possiblePaths = [
        path.join(process.cwd(), 'data', 'training', sourceFile),
        path.join(process.cwd(), 'data', 'training', 'imports', sourceFile),
        path.join(process.cwd(), 'data', 'training', 'versions', sourceFile),
        path.join(process.cwd(), 'data', 'training', 'imports', path.basename(sourceFile)),
        path.join(process.cwd(), 'data', 'training', 'versions', path.basename(sourceFile))
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          targetPath = p;
          break;
        }
      }
    }

    if (!targetPath) {
      return NextResponse.json({ error: 'Fichier source non trouvé' }, { status: 404 });
    }

    // Lire le fichier
    const rawData = fs.readFileSync(targetPath, 'utf-8');
    let data = JSON.parse(rawData);

    let updated = false;
    const updateItem = (item: any) => {
      const q = item.question || item.instruction || '';
      if (q.toLowerCase().trim() === question.toLowerCase().trim()) {
        // Ajouter l'enrichissement
        if (!item.enrichments) item.enrichments = [];
        item.enrichments.push({
          text: enrichment,
          timestamp: new Date().toISOString(),
          source: 'voice_feedback'
        });
        
        // Optionnel: On peut aussi l'ajouter à la réponse pour que ce soit "accumulatif" immédiatement
        item.response = `${item.response}\n\n[ENRICHISSEMENT]: ${enrichment}`;
        
        updated = true;
        return true;
      }
      return false;
    };

    if (Array.isArray(data)) {
      data.some(updateItem);
    } else if (data.examples && Array.isArray(data.examples)) {
      data.examples.some(updateItem);
    } else if (data.pairs && Array.isArray(data.pairs)) {
      data.pairs.some(updateItem);
    }

    if (updated) {
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
      console.log(`[ENRICH] ✅ Fichier ${path.basename(targetPath)} mis à jour`);
      
      // 🔥 Forcer le rechargement du loader pour que le changement soit immédiat
      try {
        const { trainingQRLoader } = await import('@/ai/orchestration/training-qr-loader');
        await trainingQRLoader.reload();
        console.log(`[ENRICH] 🔄 Loader rechargé avec succès`);
      } catch (reloadErr) {
        console.error(`[ENRICH] ⚠️ Erreur rechargement loader:`, reloadErr);
      }

      return NextResponse.json({ success: true, message: 'Enrichissement sauvegardé' });
    } else {
      return NextResponse.json({ error: 'Question non trouvée dans le fichier' }, { status: 404 });
    }

  } catch (error: any) {
    console.error('[ENRICH] Erreur:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
