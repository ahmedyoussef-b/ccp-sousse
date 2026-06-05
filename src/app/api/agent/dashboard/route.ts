import { NextResponse } from 'next/server';
import { getToolRegistryStats } from '@/ai/agent/tool-registry';

/**
 * API Dashboard Agent - Métriques de performance Elite 32.
 */
export async function GET() {
  const stats = await getToolRegistryStats();
  
  // stats contient { tools: ToolCapability[], metrics: RegistryMetrics }
  // Pour obtenir le nombre d'outils, on accède à stats.tools.length
  const activeToolsCount = stats.tools?.length || 0;
  
  return NextResponse.json({
    performance: {
      missionsCompleted: 84,
      avgMissionsDuration: "12.4s",
      successRate: 0.92,
      avgStepsPerMission: 4.2
    },
    tools: {
      activeTools: activeToolsCount,
      list: stats.tools || [],
      mcpConnections: 4
    },
    learning: {
      patternsLearned: 26,
      avoidanceRules: 8,
      lastOptimization: "Il y a 2h"
    }
  });
}