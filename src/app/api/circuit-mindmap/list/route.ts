export const runtime = 'edge';

// src/app/api/circuit-mindmap/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mindMapCircuitBinder } from '@/ai/mindmap/mindmap-circuit-binder';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const zoneId = searchParams.get('zoneId') || undefined;

    const circuits = mindMapCircuitBinder.listCircuitsBindingStatus(zoneId);

    return NextResponse.json({
      success: true,
      circuitsCount: circuits.length,
      circuits
    });
  } catch (error) {
    console.error('[API-MINDMAP-LIST] ❌ Erreur:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
