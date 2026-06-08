export const runtime = 'edge';

// src/app/api/admin/collections/route.ts
// API pour gérer les collections

import { NextResponse } from 'next/server';
import { collectionSyncService, initializeCollections } from '@/ai/vector/collection-sync.service';

export async function GET() {
  try {
    const status = collectionSyncService.getStatus();
    return NextResponse.json({
      success: true,
      collections: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    await initializeCollections();
    return NextResponse.json({
      success: true,
      message: 'Collections initialisées avec succès'
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT() {
  try {
    const results = await collectionSyncService.syncAllCollections();
    const summary = Array.from(results.entries()).map(([key, value]) => ({
      collection: key,
      ...value
    }));
    
    return NextResponse.json({
      success: true,
      results: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}