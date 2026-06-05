/**
 * Utilitaires pour le module SQLite core
 */

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function log(module: string, level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any): void {
  const prefix = `[SQLITE:${module}]`;
  const timestamp = new Date().toISOString().substring(11, 19);
  
  switch (level) {
    case 'info':
      console.log(`${timestamp} ${prefix} ℹ️ ${message}`);
      break;
    case 'warn':
      console.warn(`${timestamp} ${prefix} ⚠️ ${message}`);
      break;
    case 'error':
      console.error(`${timestamp} ${prefix} ❌ ${message}`);
      break;
    case 'debug':
      console.debug(`${timestamp} ${prefix} 🔍 ${message}`);
      break;
  }
  
  if (data && level !== 'debug') {
    console.log(`${timestamp} ${prefix} 📊 ${JSON.stringify(data).substring(0, 300)}`);
  }
}

export const logger = {
  info: (module: string, message: string, data?: any) => log(module, 'info', message, data),
  warn: (module: string, message: string, data?: any) => log(module, 'warn', message, data),
  error: (module: string, message: string, data?: any) => log(module, 'error', message, data),
  debug: (module: string, message: string, data?: any) => log(module, 'debug', message, data)
};