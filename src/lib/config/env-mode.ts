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
    const base = isCloudMode() ? '/tmp/logs' : `${process.cwd()}/data/logs`;
    return subdir ? `${base}/${subdir}` : base;
};

