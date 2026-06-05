/**
 * @fileOverview DailyLearningCycle - Point d'entrée pour le cycle d'apprentissage quotidien
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

import { continuousTraining } from './continuous-training';
import { TrainingResult } from './types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[DAILY-CYCLE]';

function logInfo(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} 📍 ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} ✅ ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logError(message: string, error?: any): void {
    console.error(`${LOG_PREFIX} ❌ ${message}`);
    if (error) console.error(`${LOG_PREFIX} 🔥 ${error.message || error}`);
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

/**
 * Lance le cycle d'apprentissage quotidien
 */
export async function runDailyLearningCycle(context: { memory: any[]; documents: any[] }): Promise<TrainingResult> {
    const startTime = Date.now();
    
    logInfo('🚀 Lancement du cycle d\'apprentissage quotidien...');
    
    try {
        const result = await continuousTraining.runDailyTraining(context);
        
        const duration = Date.now() - startTime;
        
        if (result.status === 'completed' && result.deployed) {
            logSuccess(`Cycle terminé avec déploiement en ${(duration / 1000).toFixed(1)}s`, {
                gain: `${((result.gain || 0) * 100).toFixed(1)}%`,
                version: result.version
            });
        } else if (result.status === 'completed') {
            logInfo(`Cycle terminé sans déploiement en ${(duration / 1000).toFixed(1)}s`, {
                reason: result.reason
            });
        } else if (result.status === 'skipped') {
            logInfo(`Cycle ignoré: ${result.reason}`);
        } else {
            logError(`Cycle échoué: ${result.reason}`);
        }
        
        return result;
        
    } catch (error: any) {
        logError('Erreur lors du cycle d\'apprentissage', error);
        return {
            status: 'failed',
            reason: error.message
        };
    }
}

// Export de la configuration
export { continuousTraining };