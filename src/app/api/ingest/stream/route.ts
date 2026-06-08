export const runtime = 'edge';

// src/app/api/ingest/stream/route.ts
import { NextRequest } from 'next/server';
import { fileService } from '@/lib/document-manager/file-service';
import path from 'path';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  
  let cleanupDone = false;
  let interval: NodeJS.Timeout;
  let onSyncStart: any, onProcessingProgress: any, onSyncComplete: any, onSyncError: any;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          console.error('[SSE] Error enqueuing message:', e);
          cleanup();
        }
      };

      onSyncStart = (data: any) => {
        sendEvent({
          jobId: data.path,
          status: 'processing',
          fileName: path.basename(data.path),
          progress: data.stage === 'EXTRACTION' ? 25 : 50,
          step: data.stage?.toLowerCase() || 'processing'
        });
      };

      onSyncComplete = (data: any) => {
        sendEvent({
          jobId: data.path,
          status: 'completed',
          fileName: path.basename(data.path),
          progress: 100,
          step: 'done'
        });
      };

      onProcessingProgress = (data: any) => {
        sendEvent({
          jobId: data.path,
          status: 'processing',
          fileName: path.basename(data.path),
          progress: data.percent,
          step: data.stage?.toLowerCase() || 'processing'
        });
      };

      onSyncError = (data: any) => {
        sendEvent({
          jobId: data.path,
          status: 'failed',
          fileName: path.basename(data.path),
          progress: 100,
          step: 'error',
          error: data.error
        });
      };

      fileService.on('sync-start', onSyncStart);
      fileService.on('processing-progress', onProcessingProgress);
      fileService.on('sync-complete', onSyncComplete);
      fileService.on('sync-error', onSyncError);
      
      interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (e) {
          cleanup();
        }
      }, 30000);
      
      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      cleanup();
    }
  });

  function cleanup() {
    if (cleanupDone) return;
    cleanupDone = true;
    if (interval) clearInterval(interval);
    if (onSyncStart) fileService.off('sync-start', onSyncStart);
    if (onProcessingProgress) fileService.off('processing-progress', onProcessingProgress);
    if (onSyncComplete) fileService.off('sync-complete', onSyncComplete);
    if (onSyncError) fileService.off('sync-error', onSyncError);
  }
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Important pour Vercel/Nginx
    }
  });
}