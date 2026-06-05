// src/components/vision/shared/hooks/useAsyncAction.ts
import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const execute = useCallback(async <T>(
    action: () => Promise<T>,
    options: {
      successMessage?: string;
      errorMessage?: string;
      onSuccess?: (result: T) => void;
      onError?: (error: Error) => void;
    } = {}
  ) => {
    setIsLoading(true);
    try {
      const result = await action();
      if (options.successMessage) {
        toast({ title: options.successMessage });
      }
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: options.errorMessage || (error instanceof Error ? error.message : "Une erreur est survenue")
      });
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return { execute, isLoading };
}