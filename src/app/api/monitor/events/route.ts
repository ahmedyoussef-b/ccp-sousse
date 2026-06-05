/**
 * @fileOverview SSE Route - Streaming des événements d'action IA.
 */

import { aiEventBus } from '@/ai/actions/event-bus';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let cleanupDone = false;
  let onAction: any;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Envoyer l'historique initial
      const history = aiEventBus.getHistory();
      if (history.length > 0) {
        history.forEach(event => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch (e) {}
        });
      }

      // 2. S'abonner aux nouveaux événements
      onAction = (event: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (e) {
          // Erreur d'encodage ou flux fermé
          cleanup();
        }
      };

      aiEventBus.on('action', onAction);

      // 3. Gérer la déconnexion
      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      cleanup();
    }
  });

  function cleanup() {
    if (cleanupDone) return;
    cleanupDone = true;
    if (onAction) aiEventBus.off('action', onAction);
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
