// src/lib/config/env-mode.ts

export const isCloudMode = (): boolean => {
    // Si la variable est explicitement définie
    if (process.env.APP_MODE === 'cloud') return true;
    if (process.env.APP_MODE === 'local') return false;
    
    // Si on est déployé sur Vercel, on force le mode cloud par défaut
    if (process.env.VERCEL === '1') return true;
    
    // Par défaut, mode local en développement
    return false;
};

export const getStorageMode = (): 'local' | 'blob' => {
    return isCloudMode() ? 'blob' : 'local';
};

export const getVectorDBMode = (): 'chromadb' | 'pgvector' => {
    return isCloudMode() ? 'pgvector' : 'chromadb';
};

export const getLLMMode = (): 'ollama' | 'cloud' => {
    return isCloudMode() ? 'cloud' : 'ollama';
};

/**
 * Retourne le chemin de base pour les logs.
 * Sur Vercel, seul /tmp est accessible en écriture.
 * En local, on utilise data/logs (relatif à process.cwd()).
 */
export const getLogBasePath = (subdir: string = ''): string => {
    const base = isCloudMode() ? '/tmp/ccp/logs' : `${process.cwd()}/data/logs`;
    return subdir ? `${base}/${subdir}` : base;
};

/**
 * Détermine si on peut écrire des logs sur le disque.
 * Sur Vercel, on désactive complètement l'écriture des logs
 * car même /tmp peut poser problème avec les fonctions serverless.
 * En local, on écrit normalement.
 */
export const canLog = (): boolean => {
    // Sur Vercel, on désactive tous les logs fichiers
    if (process.env.VERCEL === '1') return false;
    // En local, on log normalement
    return true;
};

/**
 * Alias pour isCloudMode (compatibilité avec le code existant)
 */
export const isVercel = (): boolean => {
    return process.env.VERCEL === '1';
};