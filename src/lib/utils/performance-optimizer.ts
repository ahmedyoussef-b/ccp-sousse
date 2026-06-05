import os from 'os';

/**
 * Optimiseur de performance AGENTIC
 * Calcule dynamiquement les ressources à allouer aux modèles IA
 */

export type PowerProfile = 'eco' | 'balanced' | 'turbo';

export interface PerformanceMetrics {
  threads: number;
  profile: PowerProfile;
  loadAvg: number;
  totalCpus: number;
}

/**
 * Calcule le nombre optimal de threads pour l'inférence
 * @param profile Le profil choisi par l'utilisateur
 * @returns Le nombre de threads recommandé
 */
export function getOptimalThreadCount(profile: PowerProfile = 'balanced'): number {
  const cpus = os.cpus();
  const totalCpus = cpus.length;
  
  // Note: os.loadavg() retourne [0,0,0] sur Windows. 
  // Sur Windows, on se base sur une heuristique de profil et de capacité totale.
  const isWindows = os.platform() === 'win32';
  
  // Si on est sur Windows, on simule une charge légère ou on utilise une approche conservative
  // car loadavg ne fonctionne pas nativement.
  const load = isWindows ? 0.5 : os.loadavg()[0]; 
  
  let threads = 1;

  switch (profile) {
    case 'eco':
      // Utilise environ 30% des ressources, minimum 1
      threads = Math.max(1, Math.floor(totalCpus * 0.3));
      break;
      
    case 'turbo':
      // Utilise presque tout (90%), idéal pour BitNet
      threads = Math.max(2, Math.floor(totalCpus * 0.9));
      break;
      
    case 'balanced':
    default:
      // Approche équilibrée (~60% des ressources sous charge normale)
      const buffer = isWindows ? 2 : Math.ceil(load);
      threads = Math.max(1, totalCpus - buffer);
  }

  // Toujours laisser au moins 1 thread au système
  if (threads >= totalCpus && totalCpus > 1) {
    threads = totalCpus - 1;
  }

  return Math.max(1, threads);
}

/**
 * Retourne la mémoire RAM disponible en MB
 */
export function getAvailableMemoryMB(): number {
  return Math.floor(os.freemem() / (1024 * 1024));
}

/**
 * Retourne un objet complet de métriques de performance
 */
export function getPerformanceMetrics(profile: PowerProfile = 'balanced'): PerformanceMetrics & { ram: number } {
  return {
    threads: getOptimalThreadCount(profile),
    profile,
    loadAvg: os.loadavg()[0],
    totalCpus: os.cpus().length,
    ram: getAvailableMemoryMB()
  };
}
