export const runtime = 'edge';

// app/api/procedure/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getProcedureHelp } from '@/ai/flows/procedure-help-flow';

// Sessions temporaires (Map en mémoire)
const sessions = new Map();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, problem } = body;
    
    // Charger la procédure (plus dynamique basé sur l'ID si fourni, sinon fallback)
    const procedureId = body.procedureId || 'demarrage-chaudiere';
    const procedurePath = path.join(process.cwd(), `data/procedures/${procedureId}.json`);
    
    let procedureData;
    try {
      procedureData = await fs.readFile(procedurePath, 'utf-8');
    } catch (e) {
      // Fallback si l'ID spécifique n'existe pas
      try {
        const defaultPath = path.join(process.cwd(), 'data/procedures/demarrage-chaudiere.json');
        procedureData = await fs.readFile(defaultPath, 'utf-8');
      } catch (err) {
        return NextResponse.json({ error: 'Fichier de procédure introuvable' }, { status: 404 });
      }
    }
    
    const procedure = JSON.parse(procedureData);
    
    switch(action) {
      case 'get_all_steps':
        return NextResponse.json({
          procedure: procedure.procedure,
          steps: procedure.steps.map((s: any) => ({
            number: s.number,
            description: s.instruction, // Mapping pour compatibilité Chat.tsx
            safetyNote: s.safetyWarning,
            verification: s.verificationMethod,
            expectedValue: s.expectedValue
          }))
        });

      case 'start':
        const newSessionId = Date.now().toString();
        const newSession = {
          id: newSessionId,
          procedureId: procedure.procedure.id,
          currentStep: 1,
          startedAt: new Date().toISOString(),
          completedSteps: []
        };
        sessions.set(newSessionId, newSession);
        
        return NextResponse.json({
          sessionId: newSessionId,
          currentStep: procedure.steps[0],
          progress: {
            current: 1,
            total: procedure.procedure.totalSteps,
            percent: Math.round(1 / procedure.procedure.totalSteps * 100)
          }
        });
        
      case 'next':
        const session = sessions.get(sessionId);
        if (!session) {
          return NextResponse.json({ error: 'Session inexistante ou expirée' }, { status: 404 });
        }
        
        session.completedSteps.push({
          step: session.currentStep,
          completedAt: new Date().toISOString()
        });
        
        session.currentStep++;
        
        if (session.currentStep > procedure.procedure.totalSteps) {
          sessions.delete(sessionId);
          return NextResponse.json({
            completed: true,
            summary: {
              stepsCompleted: session.completedSteps.length
            }
          });
        }
        
        const nextStepData = procedure.steps[session.currentStep - 1];
        
        return NextResponse.json({
          sessionId,
          currentStep: nextStepData,
          progress: {
            current: session.currentStep,
            total: procedure.procedure.totalSteps,
            percent: Math.round(session.currentStep / procedure.procedure.totalSteps * 100)
          }
        });
        
      case 'help':
        const currentSession = sessions.get(sessionId);
        if (!currentSession) {
          return NextResponse.json({ error: 'Session invalide' }, { status: 404 });
        }
        
        const step = procedure.steps[currentSession.currentStep - 1];
        
        try {
          const helpResult = await getProcedureHelp({
            userName: 'Opérateur',
            stepTitle: step.title,
            instruction: step.instruction,
            problem: problem || 'Besoin de précisions techniques',
            expectedValue: step.expectedValue,
            severity: 'medium',
            model: 'phi:2.7b',
            temperature: 0.7
          });
          
          return NextResponse.json({
            help: helpResult.advice,
            step: step
          });
        } catch (genkitError) {
          console.error('[API][PROCEDURE] Genkit Help Error:', genkitError);
          return NextResponse.json({ 
            help: "Désolé, je n'arrive pas à analyser ce problème pour le moment. Référez-vous au manuel technique.",
            step: step 
          });
        }
        
      case 'abort':
        if (sessionId) sessions.delete(sessionId);
        return NextResponse.json({ aborted: true });
        
      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[API][PROCEDURE] Global Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
