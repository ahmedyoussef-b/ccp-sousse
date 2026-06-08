export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { fileService } from '@/lib/document-manager/file-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();
  
  let isClientConnected = true;

  const sendEvent = (type: string, payload: any) => {
    if (!isClientConnected) return;
    try {
      const data = JSON.stringify({ ...payload, type, timestamp: Date.now() });
      writer.write(encoder.encode(`data: ${data}\n\n`));
    } catch (e) {
      console.error('Erreur envoi SSE:', e);
    }
  };

  // Listeners pour le service de fichiers
  const handlers = {
    'file-changed': (data: any) => sendEvent('file-changed', data),
    'sync-start': (data: any) => sendEvent('sync-start', data),
    'sync-complete': (data: any) => sendEvent('sync-complete', data),
    'sync-error': (data: any) => sendEvent('sync-error', data)
  };

  // S'abonner aux événements
  Object.entries(handlers).forEach(([event, handler]) => {
    fileService.on(event, handler);
  });

  // Envoyer un événement initial
  sendEvent('CONNECTED', { message: 'Moteur de synchronisation prêt' });

  // Heartbeat toutes les 15 secondes
  const heartbeat = setInterval(() => {
    if (isClientConnected) {
      try {
        writer.write(encoder.encode(': heartbeat\n\n'));
      } catch (e) {
        clearInterval(heartbeat);
      }
    }
  }, 15000);

  // Gestion de la déconnexion client
  req.signal.addEventListener('abort', () => {
    console.log('Client déconnecté, nettoyage en cours...');
    isClientConnected = false;
    clearInterval(heartbeat);
    
    // Nettoyage immédiat des listeners pour éviter les fuites de mémoire
    Object.entries(handlers).forEach(([event, handler]) => {
      fileService.off(event, handler);
    });

    try {
      writer.close().catch(() => {});
    } catch {}
  });

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Désactive le buffering nginx
    },
  });
}