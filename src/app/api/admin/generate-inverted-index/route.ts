export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { invertedIndexService } from '@/ai/search/inverted-index.service';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { action, filePath, fileName, content, zone } = await request.json();
    
    switch (action) {
      case 'index_document':
        await invertedIndexService.indexDocument(filePath, fileName, content, zone);
        return NextResponse.json({ success: true, message: 'Document indexé' });
      
      case 'remove_document':
        await invertedIndexService.removeDocument(filePath);
        return NextResponse.json({ success: true, message: 'Document supprimé' });
      
      case 'rebuild_all':
        // Scanner tous les documents existants
        const docsPath = path.join(process.cwd(), 'data', 'centrale_documents');
        const documents: Array<{ path: string; name: string; content: string; zone: string }> = [];
        
        // Fonction récursive pour scanner les dossiers
        async function scanDir(dir: string, zone: string) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await scanDir(fullPath, entry.name);
            } else if (entry.name.endsWith('.txt')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              documents.push({
                path: fullPath,
                name: entry.name,
                content,
                zone
              });
            }
          }
        }
        
        await scanDir(docsPath, 'SHARED');
        
        const result = await invertedIndexService.rebuildIndex(documents);
        return NextResponse.json({ success: true, ...result });
      
      case 'get_stats':
        const stats = await invertedIndexService.getStats();
        return NextResponse.json({ success: true, stats });
      
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    console.error('[INVERTED-INDEX-API] Erreur:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = await invertedIndexService.getStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}