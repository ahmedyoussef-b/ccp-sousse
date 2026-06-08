export const runtime = 'edge';

// src/app/api/admin/diagnostics/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Vérifie si le modèle d'embedding est disponible via Ollama
 */
async function isEmbeddingAvailable(): Promise<boolean> {
  try {
    const embeddingModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
    
    // Vérifier si le modèle existe dans Ollama
    const { stdout } = await execAsync(`ollama list | grep ${embeddingModel}`);
    
    if (!stdout || stdout.trim() === '') {
      console.warn(`[Diagnostics] Modèle d'embedding "${embeddingModel}" non trouvé`);
      return false;
    }
    
    // Tester une petite génération d'embedding
    const testPayload = JSON.stringify({
      model: embeddingModel,
      prompt: "test"
    });
    
    const testResult = await execAsync(`curl -s -X POST http://localhost:11434/api/embeddings -d '${testPayload}'`);
    
    if (testResult.stdout && testResult.stdout.includes('embedding')) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[Diagnostics] Erreur vérification embeddings:', error);
    return false;
  }
}

/**
 * Route de diagnostic système pour vérifier la stabilité des composants IA.
 */
export async function GET() {
  const manager = ChromaDBManager.getInstance();
  
  try {
    const [chromaStatus, embeddingStatus, collections] = await Promise.all([
      manager.getStatus(),
      isEmbeddingAvailable(),
      manager.getAllCollectionsStats()
    ]);

    const memoryUsage = process.memoryUsage();

    return NextResponse.json({
      status: chromaStatus.connected && embeddingStatus ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      components: {
        chromadb: {
          ...chromaStatus,
          collectionsCount: collections.length,
          stats: collections
        },
        embeddings: {
          available: embeddingStatus,
          model: process.env.EMBEDDING_MODEL || 'nomic-embed-text'
        },
        system: {
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`
        }
      }
    });
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error', 
      error: error.message 
    }, { status: 500 });
  }
}

/**
 * POST handler: déclencher la réconciliation de la banque d'images (visionService.reconcile)
 * Protected by ADMIN_RECONCILE_TOKEN (header: x-admin-token or ?token=)
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-admin-token') || req.nextUrl.searchParams.get('token');
  const expected = process.env.ADMIN_RECONCILE_TOKEN;
  if (!expected) {
    return NextResponse.json({ success: false, error: 'Reconciliation disabled (no ADMIN_RECONCILE_TOKEN set)' }, { status: 403 });
  }
  if (!token || token !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const lockPath = path.join(process.cwd(), 'tmp', 'reconcile.lock');
  try {
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    const lockExists = await fs.access(lockPath).then(() => true).catch(() => false);
    if (lockExists) {
      return NextResponse.json({ success: false, message: 'Reconciliation already in progress' }, { status: 409 });
    }
    await fs.writeFile(lockPath, String(Date.now()));

    // Lazy import to avoid heavy initialization at module import time
    const vsModule = await import('@/lib/services/visionService');
    const visionService = vsModule.default;

    await visionService.reconcile();

    await fs.rm(lockPath).catch(() => {});
    return NextResponse.json({ success: true, message: 'Reconciliation finished' });
  } catch (error: any) {
    await fs.rm(lockPath).catch(() => {});
    return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}