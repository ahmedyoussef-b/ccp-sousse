// src/types/handlebars.d.ts
declare module 'handlebars' {
    export interface HelperDelegate {
      (context?: any, options?: any): string;
    }
    
    export function registerHelper(name: string, fn: HelperDelegate): void;
  }