export const runtime = 'edge';

// src/app/api/industrial-vision/rag/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { IndustrialVisionConfig } from '@/lib/industrial-vision/types/industrial.types';
import path from 'path';
import { getIndustrialVisionIntegration } from '@/lib/industrial-vision/integration.service';

const config: IndustrialVisionConfig = {
  referencesPath: path.join(process.cwd(), 'data', 'industrial-references'),
  capturesPath: path.join(process.cwd(), 'data', 'industrial-captures'),
  seuils: {
    similariteMarche: 0.7,
    similariteArret: 0.7,
    similariteDefaut: 0.7,
    pressionMax: 12,
    temperatureMax: 60
  }
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const query = searchParams.get('query');
    
    const integration = getIndustrialVisionIntegration(config);
    await integration.initialize();
    
    switch (action) {
      case 'search':
        if (!query) {
          return NextResponse.json({ error: 'Query required' }, { status: 400 });
        }
        const results = integration.searchInAnalyses(query);
        return NextResponse.json({ success: true, results });
        
      case 'list':
        const analyses = integration.getAllAnalysesForRag();
        return NextResponse.json({ success: true, count: analyses.length, analyses });
        
      default:
        return NextResponse.json({ 
          success: true, 
          endpoints: ['?action=search&query=...', '?action=list']
        });
    }
    
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, imagePath } = body;
    
    const integration = getIndustrialVisionIntegration(config);
    await integration.initialize();
    
    switch (action) {
      case 'scan':
        const result = await integration.scanAndProcessBankImages();
        return NextResponse.json({ success: true, ...result });
        
      case 'process':
        if (!imagePath) {
          return NextResponse.json({ error: 'imagePath required' }, { status: 400 });
        }
        const processed = await integration.processImage(imagePath);
        return NextResponse.json({ success: true, result: processed });
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}