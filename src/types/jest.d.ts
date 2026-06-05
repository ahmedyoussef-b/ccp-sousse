// src/types/jest.d.ts
import '@types/jest';

declare global {
  namespace jest {
    interface MockInstance<T = any, Y extends any[] = any[]> {
      mockImplementation(fn: (...args: Y) => T): this;
      mockResolvedValue(value: T): this;
      mockRejectedValue(value: any): this;
    }
  }
}

// Pour éviter l'erreur avec les méthodes privées
export interface ClassWithPrivateMethods {
  [key: string]: any;
}