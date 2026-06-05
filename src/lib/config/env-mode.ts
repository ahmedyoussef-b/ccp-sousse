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
