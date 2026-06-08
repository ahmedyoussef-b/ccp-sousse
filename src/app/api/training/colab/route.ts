export const runtime = 'edge';

/**
 * @fileOverview API pour déclencher l'entraînement Colab
 */

import { colabTriggerService } from '@/ai/training/colab-trigger.service';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        const result = await colabTriggerService.triggerColabTraining();
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        status: 'ready',
        message: 'Utilisez POST /api/training/colab pour préparer l\'entraînement',
        instructions: `
1. Assurez-vous d'avoir collecté au moins 10 exemples
2. Appelez POST /api/training/colab
3. Suivez les instructions dans la réponse
4. Téléchargez le dataset via l'interface Antigravity
5. Exécutez le script dans Colab
6. Importez le modèle téléchargé
        `
    });
}