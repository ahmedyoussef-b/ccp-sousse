export const runtime = 'edge';

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import { DEFAULT_FILE, analyzeContextAndLinks, writeExample, TrainingExample } from '../store';

export async function POST() {
  try {
    if (!fs.existsSync(DEFAULT_FILE)) {
      return NextResponse.json({ message: "Aucun fichier à migrer." });
    }

    const data = fs.readFileSync(DEFAULT_FILE, 'utf-8');
    if (!data.trim()) {
      return NextResponse.json({ message: "Le fichier est vide." });
    }

    const legacyExamples: TrainingExample[] = JSON.parse(data);
    let migratedCount = 0;

    for (const example of legacyExamples) {
      if (!example.context) {
        console.log(`Migration de l'exemple ID: ${example.id}...`);
        // Analyser
        const contextData = await analyzeContextAndLinks(example.question, example.response);
        
        example.context = contextData?.context || 'general';
        example.suggestedResources = {
          images: contextData?.imagesKeywords || [],
          mindMapNodes: contextData?.mindMapNodes || []
        };
        
        // Sauvegarder dans le bon dossier
        writeExample(example);
        migratedCount++;
      }
    }

    // Vider l'ancien fichier ou le supprimer
    fs.unlinkSync(DEFAULT_FILE);

    return NextResponse.json({ 
      success: true, 
      message: `${migratedCount} exemples migrés avec succès et l'ancien fichier a été supprimé !` 
    });

  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json(
      { error: "La migration a échoué." },
      { status: 500 }
    );
  }
}
