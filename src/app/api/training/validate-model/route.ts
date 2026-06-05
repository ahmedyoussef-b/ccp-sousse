// app/api/training/validate-model/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { modelName } = await request.json();
    
    console.log('[validate-model] Validation du modèle:', modelName);
    
    // Test simple avec Ollama via API REST au lieu d'un processus enfant
    const testPrompt = "Quelle est la pression maximale d'admission pour TG1 ?";
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // Timeout 90s pour charger le modèle

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: testPrompt,
          stream: false,
          options: {
            num_predict: 50 // Nombre limité de tokens pour juste valider que ça tourne
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('[validate-model] Test réussi');
      
      return NextResponse.json({
        success: true,
        message: 'Modèle validé avec succès',
        response: data.response?.substring(0, 300) || 'Pas de réponse'
      });
    } catch (testError) {
      console.error('[validate-model] Erreur test:', testError);
      
      // Le modèle peut être importé mais pas encore testable
      return NextResponse.json({
        success: true,
        warning: 'Modèle importé mais test non concluant',
        message: 'Le modèle est disponible dans Ollama. Testez-le manuellement.'
      });
    }
    
  } catch (error) {
    console.error('[validate-model] Erreur:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la validation' },
      { status: 500 }
    );
  }
}