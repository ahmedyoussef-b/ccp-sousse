export const runtime = 'edge';

// app/api/training/upload-dataset/route.ts
// Version corrigée avec meilleure gestion des erreurs

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Interface pour les exemples normalisés
interface NormalizedExample {
  question: string;
  response: string;
  quality: number;
}

// Fonction pour normaliser différents formats d'entrée
function normalizeExample(item: any): NormalizedExample | null {
  // Format standard: { question, response }
  if (item.question && item.response) {
    return {
      question: item.question.trim(),
      response: item.response.trim(),
      quality: item.quality || 5
    };
  }
  
  // Format: { instruction, response }
  if (item.instruction && item.response) {
    return {
      question: item.instruction.trim(),
      response: item.response.trim(),
      quality: item.quality || 5
    };
  }
  
  // Format: { question, answer }
  if (item.question && item.answer) {
    return {
      question: item.question.trim(),
      response: item.answer.trim(),
      quality: item.quality || 5
    };
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  console.log('[upload-dataset] Début du traitement');
  
  try {
    // 1. Récupérer le fichier
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    console.log('[upload-dataset] Fichier reçu:', file?.name);
    
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }
    
    if (!file.name.endsWith('.json')) {
      return NextResponse.json({ error: 'Format non supporté. Veuillez uploader un fichier JSON.' }, { status: 400 });
    }
    
    // 2. Lire le contenu
    const content = await file.text();
    console.log('[upload-dataset] Contenu lu, longueur:', content.length);
    
    let importedData: any[];
    try {
      importedData = JSON.parse(content);
      console.log('[upload-dataset] JSON parsé, type:', Array.isArray(importedData) ? 'array' : typeof importedData);
    } catch (parseError) {
      console.error('[upload-dataset] Erreur parsing JSON:', parseError);
      return NextResponse.json({ error: 'Fichier JSON invalide' }, { status: 400 });
    }
    
    // 3. S'assurer que c'est un tableau
    if (!Array.isArray(importedData)) {
      importedData = [importedData];
    }
    
    // 4. Normaliser les exemples
    const validExamples: NormalizedExample[] = [];
    const errors: string[] = [];
    
    for (let i = 0; i < importedData.length; i++) {
      const normalized = normalizeExample(importedData[i]);
      if (normalized) {
        validExamples.push(normalized);
      } else {
        errors.push(`Ligne ${i + 1}: format invalide`);
      }
    }
    
    console.log('[upload-dataset] Exemples valides:', validExamples.length);
    
    if (validExamples.length === 0) {
      return NextResponse.json({ 
        error: 'Aucun exemple valide trouvé. Format attendu: { "question": "...", "response": "..." }' 
      }, { status: 400 });
    }
    
    // 5. Lire les exemples existants
    const examplesPath = path.join(process.cwd(), 'data', 'training', 'examples.json');
    console.log('[upload-dataset] Chemin examples.json:', examplesPath);
    
    // Créer le dossier si nécessaire
    const dir = path.dirname(examplesPath);
    if (!fs.existsSync(dir)) {
      console.log('[upload-dataset] Création du dossier:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let existingExamples: any[] = [];
    if (fs.existsSync(examplesPath)) {
      try {
        const existingContent = fs.readFileSync(examplesPath, 'utf-8');
        existingExamples = JSON.parse(existingContent);
        console.log('[upload-dataset] Exemples existants:', existingExamples.length);
      } catch (readError) {
        console.error('[upload-dataset] Erreur lecture examples.json:', readError);
        existingExamples = [];
      }
    }
    
    // 6. Ajouter les nouveaux exemples
    const newExamples = validExamples.map((ex, idx) => ({
      id: Date.now().toString() + '_' + idx + '_' + Math.random().toString(36).substring(2, 8),
      question: ex.question,
      response: ex.response,
      quality: ex.quality,
      source: 'import',
      createdAt: new Date().toISOString()
    }));
    
    const allExamples = [...existingExamples, ...newExamples];
    
    // 7. Sauvegarder
    fs.writeFileSync(examplesPath, JSON.stringify(allExamples, null, 2), 'utf-8');
    console.log('[upload-dataset] Sauvegarde réussie, total:', allExamples.length);
    
    return NextResponse.json({
      success: true,
      count: newExamples.length,
      total: allExamples.length,
      message: `${newExamples.length} exemples importés avec succès`
    });
    
  } catch (error) {
    console.error('[upload-dataset] Erreur fatale:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}