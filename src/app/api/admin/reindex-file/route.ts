export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { DocumentProcessor } from '@/lib/document-manager/document-processor';

export async function POST(req: NextRequest) {
  try {
    const { filePath, zone } = await req.json();
    
    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 });
    }
    
    console.log(`[REINDEX] Indexation du fichier: ${filePath}`);
    
    const processor = new DocumentProcessor((stage, percent, detail) => {
      console.log(`[REINDEX] ${stage} - ${percent}% ${detail || ''}`);
    });
    
    const result = await processor.processDocument(filePath, { 
      zone: zone || 'SHARED',
      forceReindex: true 
    });
    
    return NextResponse.json({ 
      success: true, 
      chunksCount: result.chunksCount,
      documentId: result.documentId,
      message: `Indexation terminée: ${result.chunksCount} chunks`
    });
    
  } catch (error: any) {
    console.error('[REINDEX] Erreur:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}