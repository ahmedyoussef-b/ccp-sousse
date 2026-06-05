// src/app/api/circuit-mindmap/[circuitId]/nodes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mindMapManager } from '@/ai/mindmap/mindmap-manager';
import { mindMapEmbedder } from '@/ai/mindmap/mindmap-embedder';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ circuitId: string }> }
) {
  try {
    const { circuitId } = await params;
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type');

    const mindmap = mindMapManager.getMindMapByCircuit(circuitId);
    if (!mindmap) {
      return NextResponse.json(
        { success: false, error: `Mind Map non trouvé pour ${circuitId}.` },
        { status: 404 }
      );
    }

    let nodes = mindmap.mindmapData.nodes;
    if (typeFilter) {
      nodes = nodes.filter(n => n.type === typeFilter);
    }

    return NextResponse.json({ success: true, nodes });
  } catch (error) {
    console.error('[API-MINDMAP-NODES-GET] ❌ Erreur:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ circuitId: string }> }
) {
  try {
    const { circuitId } = await params;
    const nodeData = await request.json(); // Single node { id, parentId, type, label, description, positionX, positionY, style }

    if (!nodeData.label || !nodeData.type) {
      return NextResponse.json(
        { success: false, error: 'label et type sont requis.' },
        { status: 400 }
      );
    }

    const mindmap = mindMapManager.getMindMapByCircuit(circuitId);
    if (!mindmap) {
      return NextResponse.json(
        { success: false, error: `Mind Map non trouvé pour le circuit ${circuitId}. Créez-le d'abord.` },
        { status: 404 }
      );
    }

    const updatedNodes = [...mindmap.mindmapData.nodes];
    const nodeIndex = updatedNodes.findIndex(n => n.id === nodeData.id);

    if (nodeIndex >= 0) {
      // Update existing node
      updatedNodes[nodeIndex] = {
        ...updatedNodes[nodeIndex],
        ...nodeData
      };
    } else {
      // Add new node
      updatedNodes.push({
        id: nodeData.id || `node_${Date.now()}`,
        parentId: nodeData.parentId || null,
        type: nodeData.type,
        label: nodeData.label,
        description: nodeData.description || null,
        positionX: nodeData.positionX ?? null,
        positionY: nodeData.positionY ?? null,
        style: nodeData.style || {}
      });
    }

    const updatedData = {
      ...mindmap.mindmapData,
      nodes: updatedNodes
    };

    // Save the entire mindmap
    const updated = await mindMapManager.saveMindMap(
      circuitId,
      updatedData,
      mindmap.thumbnailUrl,
      mindmap.metadata
    );

    // Vectorize nodes
    await mindMapEmbedder.vectorizeMindMap(updated);

    return NextResponse.json({
      success: true,
      message: nodeIndex >= 0 ? 'Nœud mis à jour avec succès.' : 'Nœud ajouté avec succès.',
      node: nodeData,
      mindmap: updated
    });
  } catch (error) {
    console.error('[API-MINDMAP-NODES-POST] ❌ Erreur:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
