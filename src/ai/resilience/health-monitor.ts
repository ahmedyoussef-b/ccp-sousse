// src/ai/resilience/health-monitor.ts
/**
 * Moniteur de santé Groq et Connectivité
 * @version 1.0.0
 * @lastUpdated 2026-04-13
 */

export enum SystemMode {
  NOMINAL = 'NOMINAL',       // Internet OK + Groq OK
  DEGRADED = 'DEGRADED',     // Internet OK + Groq FAIL
  OFFLINE = 'OFFLINE',       // Internet FAIL
  MAINTENANCE = 'MAINTENANCE' // Force local mode for maintenance
}

export interface HealthStatus {
  mode: SystemMode;
  groqAvailable: boolean;
  internetAvailable: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

class HealthMonitor {
  private status: HealthStatus = {
    mode: SystemMode.NOMINAL,
    groqAvailable: true,
    internetAvailable: true,
    lastCheck: Date.now(),
    consecutiveFailures: 0,
    consecutiveSuccesses: 0
  };

  private readonly TIMEOUT = 5000;         // 5s (assoupli pour éviter les faux-positifs)
  private readonly FAILURE_THRESHOLD = 3;  // 3 échecs pour basculer
  private readonly SUCCESS_THRESHOLD = 1;  // 1 seul succès suffit pour revenir (Priorité Groq)

  constructor() {
    // Suppression du setInterval en tâche de fond pour une exécution "lazy"
    // (empêche les boucles infinies et les fuites mémoire dans Next.js)
  }

  public getStatus(): HealthStatus {
    return { ...this.status };
  }

  private isChecking = false;

  /**
   * Vérifie la santé de Groq et la connectivité globale
   */
  public async checkHealth(force = false): Promise<HealthStatus> {
    // Éviter les requêtes concurrentes simultanées
    if (this.isChecking) return this.getStatus();

    // Utiliser le cache si la requête date de moins de 15s (sauf si forcé)
    const now = Date.now();
    if (!force && now - this.status.lastCheck < 15000) {
      return this.getStatus();
    }

    this.isChecking = true;
    const groqKey = process.env.GROQ_API_KEY;
    
    let groqOk = false;
    let internetOk = false;

    try {
      // Test direct Groq (fait office de test internet + API)
      const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${groqKey}` },
        signal: AbortSignal.timeout(this.TIMEOUT)
      }).catch(() => null);
      
      groqOk = !!groqRes && groqRes.ok;
      internetOk = !!groqRes; // Si Groq répond (même erreur auth), internet est là
      
      if (!internetOk) {
        // Fallback internet check si Groq est totalement injoignable
        const netRes = await fetch('https://api.cloudflare.com/client/v4/ips', { 
          method: 'HEAD', 
          signal: AbortSignal.timeout(2000) 
        }).catch(() => null);
        internetOk = !!netRes && netRes.ok;
      }
    } catch (e) {
      console.error('[HEALTH-MONITOR] Erreur pendant le check health:', e);
    } finally {
      this.isChecking = false;
    }

    this.updateStatus(internetOk, groqOk);
    return this.getStatus();
  }

  private lastLoggedStatus: string = '';

  private updateStatus(internetOk: boolean, groqOk: boolean) {

    this.status.internetAvailable = internetOk;
    this.status.groqAvailable = groqOk;
    this.status.lastCheck = Date.now();

    if (!internetOk) {
      this.status.mode = SystemMode.OFFLINE;
      this.status.consecutiveFailures++;
      this.status.consecutiveSuccesses = 0;
    } else if (!groqOk) {
      this.status.consecutiveFailures++;
      this.status.consecutiveSuccesses = 0;
      
      if (this.status.consecutiveFailures >= this.FAILURE_THRESHOLD) {
        this.status.mode = SystemMode.DEGRADED;
      }
    } else {
      this.status.consecutiveSuccesses++;
      
      // Retour au mode nominal uniquement après SUCCESS_THRESHOLD
      if (this.status.consecutiveSuccesses >= this.SUCCESS_THRESHOLD) {
        this.status.mode = SystemMode.NOMINAL;
        this.status.consecutiveFailures = 0;
      }
    }

    // Uniquement log si le statut a changé significativement
    const currentStatusStr = `${this.status.mode}-${this.status.groqAvailable}-${this.status.internetAvailable}`;
    if (currentStatusStr !== this.lastLoggedStatus) {
      console.log(`[HEALTH-MONITOR] Mode: ${this.status.mode} | Groq: ${this.status.groqAvailable} | Internet: ${this.status.internetAvailable}`);
      this.lastLoggedStatus = currentStatusStr;
    }
  }

  /**
   * Forcer manuellement un mode (ex: maintenance)
   */
  public setMode(mode: SystemMode) {
    this.status.mode = mode;
    console.log(`[HEALTH-MONITOR] Mode forcé manuellement : ${mode}`);
  }
}

// Singleton
export const healthMonitor = new HealthMonitor();
