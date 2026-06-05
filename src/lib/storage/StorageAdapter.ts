export interface StorageAdapter {
    /**
     * Sauvegarde un fichier et retourne son URL (ou chemin local)
     */
    put(filepath: string, data: string | Buffer | object, options?: { contentType?: string, isPublic?: boolean }): Promise<string>;
    
    /**
     * Lit un fichier (retourne un string pour le texte/JSON, ou un buffer)
     */
    get(filepath: string): Promise<string | Buffer | null>;
    
    /**
     * Lit un fichier JSON et le parse
     */
    getJSON<T>(filepath: string): Promise<T | null>;
    
    /**
     * Supprime un fichier
     */
    delete(filepath: string): Promise<boolean>;
}
