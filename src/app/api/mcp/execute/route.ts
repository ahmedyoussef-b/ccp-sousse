export const runtime = 'edge';

/**
 * @fileOverview API Route MCP - Pont entre le frontend et le service MCP
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeMCPTool } from '@/ai/mcp/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, action, parameters } = body;
    
    if (!tool || !action) {
      return NextResponse.json(
        { error: 'Paramètres manquants: tool et action requis' },
        { status: 400 }
      );
    }
    
    const result = await executeMCPTool({
      tool,
      action,
      parameters: parameters || {},
      options: {
        reversible: true,
        timeout: 30000,
        retryCount: 2
      }
    });
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Erreur API MCP:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    );
  }
}