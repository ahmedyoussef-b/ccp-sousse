/**
 * Nettoie le texte pour la synthèse vocale (TTS).
 * Supprime les marqueurs Markdown et les symboles techniques qui nuisent à l'écoute.
 */
export function cleanTextForTTS(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // 1. Supprimer les blocs de code (```code```)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ' ');
  
  // 2. Supprimer le code inline (`code`)
  cleaned = cleaned.replace(/`[^`]+`/g, ' ');
  
  // 3. Supprimer les liens [texte](url) - garder seulement le texte
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  
  // 4. Supprimer les images ![alt](url)
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^\)]+\)/g, ' ');
  
  // 5. Supprimer les marqueurs de style Markdown (**, *, _, __)
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); 
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');     
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  
  // 6. Supprimer les titres (#, ##, etc.)
  cleaned = cleaned.replace(/^#+\s*/gm, '');
  
  // 7. Supprimer les puces de listes (-, *, +) au début des lignes
  cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, '');
  
  // 8. Supprimer les lignes de séparation (---, ***, ___)
  cleaned = cleaned.replace(/^\s*[-*_]{3,}\s*$/gm, ' ');
  
  // 9. Supprimer les astérisques isolés restants
  cleaned = cleaned.replace(/\*/g, ' ');
  
  // 10. Supprimer les émojis pour éviter que la voix ne lise "visage souriant", "fusée", etc.
  cleaned = cleaned.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
  
  // 11. AHMED: Supprimer les instructions d'interface spécifiques (bruit vocal)
  cleaned = cleaned.replace(/Cliquez sur\s+["'][^"']+["']/gi, ' ');
  // Supprimer les flèches de suggestion
  cleaned = cleaned.replace(/➡️/g, ' ');
  // Supprimer les mentions de "suggestions"
  cleaned = cleaned.replace(/\(dans les suggestions\)/gi, ' ');
  // Supprimer les blocs de métadonnées de fin (Réponse générée par...)
  cleaned = cleaned.replace(/Réponse générée par:?\s+[A-Z]+/gi, ' ');
  
  // 12. Normaliser les espaces et retours à la ligne
  cleaned = cleaned.replace(/\n/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}