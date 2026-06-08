export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
/**
 * @fileOverview Agent API Route - Innovation Elite 32.
 * Point d'entrée pour les missions autonomes : Décomposition -> Planification -> Exécution MCP -> Apprentissage.
 */
import { processAgentMission } from '@/ai/agent/agent-core';

/**
 * Gère les missions agentiques autonomes.
 * Utilisé pour les tâches multi-étapes nécessitant des outils (search, calculate, email, etc.)
 */
export async function POST(req: NextRequest) {
  console.log("[API][AGENT] Réception d'une nouvelle mission autonome...");

  try {
    const { request, userId = 'default-user' } = await req.json();

    if (!request) {
      return NextResponse.json(
        { error: "La description de la mission est requise." }, 
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Orchestration via le cœur décisionnel Agentic (Phases 1 à 4)
    // 1. MCP Context Gather & Intention Analysis
    // 2. Task Planning (Hierarchical Decomposition)
    // 3. Resilient Execution (MCP Tools)
    // 4. Learning from Execution (Pattern Extraction)
    const missionResult = await processAgentMission(request, userId);

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

    return NextResponse.json({
      success: true,
      summary: missionResult.summary,
      details: missionResult.details,
      steps: missionResult.steps,
      duration: `${durationSec}s`,
      canUndo: missionResult.canUndo,
      patternsLearned: missionResult.patternsLearned,
      suggestions: missionResult.suggestions,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error("[API][AGENT] Échec critique de la mission agentique:", error);
    return NextResponse.json({ 
      success: false,
      error: "L'agent a rencontré une difficulté majeure lors de l'exécution.",
      details: error.message 
    }, { status: 500 });
  }
}

/**
 * Retourne les métriques de performance de l'agent.
 */
export async function GET() {
  try {
    const { getAgentMetrics, getRAMFallbackCount } = await import('@/ai/agent/agent-core');
    const { getToolRegistryStats } = await import('@/ai/agent/tool-registry');
    const { getMCPMetrics } = await import('@/ai/agent/mcp');
    const { getPlanningMetrics } = await import('@/ai/agent/task-planner');
    const { getExecutorMetrics } = await import('@/ai/agent/task-executor');
    
    const metrics = getAgentMetrics();
    const ramFallbacks = getRAMFallbackCount();
    const toolStats = await getToolRegistryStats();
    const mcpMetrics = getMCPMetrics();
    const planningMetrics = getPlanningMetrics();
    const executorMetrics = getExecutorMetrics();

    return NextResponse.json({
      success: true,
      agent: {
        ...metrics,
        ramFallbackCount: ramFallbacks
      },
      registry: toolStats,
      mcp: mcpMetrics,
      planning: planningMetrics,
      executor: executorMetrics,
      timestamp: Date.now()
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Réinitialise toutes les statistiques de l'agent.
 */
export async function DELETE() {
  try {
    const { resetAgentMetrics } = await import('@/ai/agent/agent-core');
    const { resetRegistryStats } = await import('@/ai/agent/tool-registry');
    const { resetMCPMetrics } = await import('@/ai/agent/mcp');
    const { resetPlanningMetrics } = await import('@/ai/agent/task-planner');
    const { resetExecutorMetrics } = await import('@/ai/agent/task-executor');
    
    resetAgentMetrics();
    await resetRegistryStats();
    resetMCPMetrics();
    resetPlanningMetrics();
    resetExecutorMetrics();

    return NextResponse.json({ 
      success: true, 
      message: "Toutes les statistiques de l'agent et du registre ont été réinitialisées." 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
