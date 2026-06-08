export const runtime = 'edge';

// src/app/api/industrial-vision/innovations/localiser/route.ts
//
// API dédiée — Innovation #1 : Indexation texte → Localisation
// Recherche réelle dans la banque d'images via l'index des organes.

import { NextRequest, NextResponse } from 'next/server';
import { localiserOrgane, buildVisionIndex, listerTousOrganes } from '@/lib/industrial-vision/innovations/vision-index.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, action } = body;

    if (!query?.trim() && action !== 'list' && action !== 'build') {
      return NextResponse.json(
        { error: 'Le paramètre "query" est requis' },
        { status: 400 }
      );
    }

    // Action : construire / rafraîchir l'index
    if (action === 'build') {
      const index = await buildVisionIndex(true);
      return NextResponse.json({
        success: true,
        message: `Index construit : ${index.imageCount} images, ${index.organeCount} organes indexés`,
        stats: {
          imageCount: index.imageCount,
          organeCount: index.organeCount,
          lastUpdated: index.lastUpdated
        }
      });
    }

    // Action : lister tous les organes
    if (action === 'list') {
      const result = await listerTousOrganes();
      return NextResponse.json({ success: true, ...result });
    }

    // Action par défaut : localiser un organe
    const result = await localiserOrgane(query);
    return NextResponse.json({ success: true, ...result });

  } catch (err: any) {
    console.error('[Localiser Organe API]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Erreur interne' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');
  const query = req.nextUrl.searchParams.get('q');

  try {
    if (action === 'list') {
      const result = await listerTousOrganes();
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'status') {
      const index = await buildVisionIndex();
      return NextResponse.json({
        success: true,
        imageCount: index.imageCount,
        organeCount: index.organeCount,
        lastUpdated: index.lastUpdated,
        organes: [...new Set(index.organes.map(o => o.nom))].sort()
      });
    }

    if (query) {
      const result = await localiserOrgane(query);
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({
      endpoints: [
        'GET ?action=status — état de l\'index',
        'GET ?action=list — liste tous les organes',
        'GET ?q=NOM_ORGANE — localiser un organe',
        'POST { query: "NOM" } — localiser',
        'POST { action: "build" } — reconstruire l\'index',
        'POST { action: "list" } — lister les organes'
      ]
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
