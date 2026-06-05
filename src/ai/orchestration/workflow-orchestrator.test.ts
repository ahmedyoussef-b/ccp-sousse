import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workflowOrchestrator, WorkflowOrchestrator, type TaskGraph } from './workflow-orchestrator';

describe('WorkflowOrchestrator', () => {
  // Réinitialiser entre les tests si nécessaire
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exécution séquentielle avec piping', () => {
    it('devrait exécuter des tâches en séquence avec passage de données (Piping)', async () => {
      const graph: TaskGraph = {
        id: 'test-seq',
        tasks: [
          { 
            id: 't1', 
            toolName: 'search', 
            params: { query: 'pression' }, 
            dependencies: [], 
            outputKey: 'search_res', 
            status: 'pending' 
          },
          { 
            id: 't2', 
            toolName: 'summarize', 
            params: { text: 'Résultat de {{search_res.data}}' }, 
            dependencies: ['t1'], 
            outputKey: 'final', 
            status: 'pending' 
          }
        ]
      };

      const toolExecutor = vi.fn()
        .mockResolvedValueOnce({ data: 'Info technique' })
        .mockResolvedValueOnce({ summary: 'Synthèse finie' });

      const finalResults = await workflowOrchestrator.executeWorkflow(graph, toolExecutor);

      expect(toolExecutor).toHaveBeenCalledTimes(2);
      expect(toolExecutor).toHaveBeenNthCalledWith(1, 'search', { query: 'pression' });
      expect(toolExecutor).toHaveBeenNthCalledWith(2, 'summarize', { text: 'Résultat de Info technique' });
      expect(finalResults.final?.summary).toBe('Synthèse finie');
    });

    it('devrait gérer les erreurs correctement', async () => {
      const graph: TaskGraph = {
        id: 'test-error',
        tasks: [
          { 
            id: 't1', 
            toolName: 'failingTool', 
            params: {}, 
            dependencies: [], 
            outputKey: 'result', 
            status: 'pending' 
          }
        ]
      };

      const toolExecutor = vi.fn().mockRejectedValue(new Error('Erreur simulée'));

      await expect(workflowOrchestrator.executeWorkflow(graph, toolExecutor))
        .rejects
        .toThrow('Échec de la tâche t1 (failingTool): Error: Erreur simulée');
      
      expect(toolExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe('Exécution parallèle', () => {
    it('devrait exécuter des tâches indépendantes en parallèle', async () => {
      const graph: TaskGraph = {
        id: 'test-para',
        tasks: [
          { 
            id: 'p1', 
            toolName: 'slowTool', 
            params: { delay: 50 }, 
            dependencies: [], 
            status: 'pending' 
          },
          { 
            id: 'p2', 
            toolName: 'slowTool', 
            params: { delay: 50 }, 
            dependencies: [], 
            status: 'pending' 
          }
        ]
      };

      let runningCount = 0;
      let maxConcurrent = 0;

      const toolExecutor = async (_name: string, params: any) => {
        runningCount++;
        maxConcurrent = Math.max(maxConcurrent, runningCount);
        
        // Simulation de latence
        await new Promise(resolve => setTimeout(resolve, params.delay || 50));
        
        runningCount--;
        return { done: true, duration: params.delay };
      };

      const startTime = Date.now();
      await workflowOrchestrator.executeWorkflow(graph, toolExecutor);
      const duration = Date.now() - startTime;

      // En parallèle, la durée devrait être ~50ms (pas 100ms)
      expect(duration).toBeLessThan(90);
      // Vérifier que les tâches ont bien été exécutées en parallèle
      expect(maxConcurrent).toBe(2);
    });

    it('devrait exécuter en parallèle puis séquentiel selon dépendances', async () => {
      const graph: TaskGraph = {
        id: 'test-mixed',
        tasks: [
          { id: 'p1', toolName: 'tool', params: {}, dependencies: [], outputKey: 'res1', status: 'pending' },
          { id: 'p2', toolName: 'tool', params: {}, dependencies: [], outputKey: 'res2', status: 'pending' },
          { id: 'p3', toolName: 'tool', params: { data: '{{res1}}' }, dependencies: ['p1', 'p2'], outputKey: 'final', status: 'pending' }
        ]
      };

      const executionOrder: string[] = [];

      const toolExecutor = async (_name: string, params: any) => {
        if (params.data) {
          executionOrder.push('p3');
          await new Promise(resolve => setTimeout(resolve, 10));
          return { result: 'combined' };
        } else {
          const id = executionOrder.length === 0 ? 'p1' : 'p2';
          executionOrder.push(id);
          await new Promise(resolve => setTimeout(resolve, 20));
          return { result: id };
        }
      };

      await workflowOrchestrator.executeWorkflow(graph, toolExecutor);

      // p1 et p2 doivent être avant p3 (ordre exact non garanti)
      expect(executionOrder.indexOf('p3')).toBeGreaterThan(executionOrder.indexOf('p1'));
      expect(executionOrder.indexOf('p3')).toBeGreaterThan(executionOrder.indexOf('p2'));
    });
  });

  describe('Cas limites', () => {
    it('devrait gérer un graphe vide', async () => {
      const graph: TaskGraph = {
        id: 'test-empty',
        tasks: []
      };

      const toolExecutor = vi.fn();
      const result = await workflowOrchestrator.executeWorkflow(graph, toolExecutor);

      expect(toolExecutor).not.toHaveBeenCalled();
      expect(result).toEqual({});
    });

    it('devrait gérer une tâche unique sans dépendances', async () => {
      const graph: TaskGraph = {
        id: 'test-single',
        tasks: [
          { id: 't1', toolName: 'simple', params: { value: 42 }, dependencies: [], outputKey: 'result', status: 'pending' }
        ]
      };

      const toolExecutor = vi.fn().mockResolvedValue({ computed: 84 });
      const result = await workflowOrchestrator.executeWorkflow(graph, toolExecutor);

      expect(toolExecutor).toHaveBeenCalledWith('simple', { value: 42 });
      expect(result.result?.computed).toBe(84);
    });

    it('devrait détecter les dépendances circulaires', async () => {
      const graph: TaskGraph = {
        id: 'test-circular',
        tasks: [
          { id: 't1', toolName: 'tool', params: {}, dependencies: ['t2'], status: 'pending' },
          { id: 't2', toolName: 'tool', params: {}, dependencies: ['t1'], status: 'pending' }
        ]
      };

      const toolExecutor = vi.fn().mockResolvedValue({});

      await expect(workflowOrchestrator.executeWorkflow(graph, toolExecutor))
        .rejects
        .toThrow('Dépendance circulaire ou bloquante détectée');
      
      expect(toolExecutor).not.toHaveBeenCalled();
    });

    it('devrait gérer le piping avec des chemins imbriqués', async () => {
      const graph: TaskGraph = {
        id: 'test-nested',
        tasks: [
          { 
            id: 't1', 
            toolName: 'fetch', 
            params: {}, 
            dependencies: [], 
            outputKey: 'user', 
            status: 'pending' 
          },
          { 
            id: 't2', 
            toolName: 'process', 
            params: { profile: '{{user.data.profile}}', name: '{{user.data.name}}' }, 
            dependencies: ['t1'], 
            outputKey: 'processed', 
            status: 'pending' 
          }
        ]
      };

      const toolExecutor = vi.fn()
        .mockResolvedValueOnce({ data: { name: 'John', profile: { age: 30, city: 'Paris' } } })
        .mockResolvedValueOnce({ result: 'processed data' });

      await workflowOrchestrator.executeWorkflow(graph, toolExecutor);

      expect(toolExecutor).toHaveBeenNthCalledWith(2, 'process', { 
        profile: { age: 30, city: 'Paris' }, 
        name: 'John' 
      });
    });
  });

  describe('WorkflowOrchestrator - Instance', () => {
    it('devrait créer une instance fonctionnelle', () => {
      const orchestrator = new WorkflowOrchestrator();
      expect(orchestrator).toBeInstanceOf(WorkflowOrchestrator);
      expect(orchestrator.executeWorkflow).toBeDefined();
    });
  });
});