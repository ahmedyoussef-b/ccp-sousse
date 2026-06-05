// components/training/RAGTrainingPanel.tsx
/**
 * @fileOverview Panneau d'entraînement RAG - interagit avec ChromaDB à partir
 *               des paires Q/R collectées dans Collecte Manuelle.
 *               Intégré dans le Training Dashboard (🧠).
 * @version 1.0.0
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Layers,
  BookOpen,
  Zap,
  BarChart3,
  ArrowRight,
} from 'lucide-react';

interface QRStats {
  total: number;
  bySource: { manual: number; import: number; feedback: number };
  avgQuality: number;
}

interface SyncResult {
  success: boolean;
  deletedCount: number;
  indexedCount: number;
  zoneDistribution: Record<string, number>;
  message?: string;
}

export default function RAGTrainingPanel() {
  const [qrStats, setQRStats] = useState<QRStats | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const fetchQRStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch('/api/training/examples');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const examples = data.examples || [];
      const total = examples.length;
      const bySource = {
        manual: examples.filter((e: any) => e.source === 'manual').length,
        import: examples.filter((e: any) => e.source === 'import').length,
        feedback: examples.filter((e: any) => e.source === 'feedback').length,
      };
      const avgQuality =
        total > 0
          ? examples.reduce((acc: number, e: any) => acc + (e.quality || 0), 0) / total
          : 0;
      setQRStats({ total, bySource, avgQuality });
    } catch (err) {
      console.error('[RAGTrainingPanel] fetchQRStats error:', err);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchQRStats();
  }, [fetchQRStats]);

  const handleSyncRAG = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch('/api/training/rag-index', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erreur HTTP ' + res.status);
      setSyncResult(result);
      // Refresh stats after sync
      await fetchQRStats();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Impossible de synchroniser avec ChromaDB.');
    } finally {
      setIsSyncing(false);
    }
  };

  const totalQR = qrStats?.total ?? 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
            <Layers className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              🧠 Entraînement RAG (Retrieval-Augmented Generation)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Indexation des Q/R collectées dans ChromaDB pour amélioration temps-réel du chatbot
            </p>
          </div>
        </div>
        <button
          onClick={fetchQRStats}
          disabled={isLoadingStats}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Rafraîchir les statistiques"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingStats ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Q/R */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium">
            <Database className="w-3.5 h-3.5" />
            Total Q/R collectées
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoadingStats ? '…' : totalQR}
          </p>
        </div>

        {/* Manuelles */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium">
            <BookOpen className="w-3.5 h-3.5" />
            Saisies manuellement
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoadingStats ? '…' : (qrStats?.bySource.manual ?? 0)}
          </p>
        </div>

        {/* Importées */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium">
            <BarChart3 className="w-3.5 h-3.5" />
            Importées
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoadingStats ? '…' : (qrStats?.bySource.import ?? 0)}
          </p>
        </div>

        {/* Qualité moyenne */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium">
            <Zap className="w-3.5 h-3.5" />
            Qualité moy.
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoadingStats ? '…' : `${(qrStats?.avgQuality ?? 0).toFixed(1)}/5`}
          </p>
        </div>
      </div>

      {/* Action section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Sync RAG */}
        <div className="border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Indexation RAG → ChromaDB
            </h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Envoie les <span className="font-bold text-emerald-700 dark:text-emerald-400">{totalQR} paires Q/R</span> collectées
            vers ChromaDB. Le classifieur les répartit automatiquement dans les collections techniques
            (zones B3, CR, TG…) pour enrichir le contexte RAG en temps réel.
          </p>
          <button
            onClick={handleSyncRAG}
            disabled={isSyncing || totalQR === 0}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-white transition-all ${
              totalQR === 0
                ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed text-gray-500'
                : isSyncing
                ? 'bg-emerald-400 dark:bg-emerald-700 cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg'
            }`}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Synchronisation en cours...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                Synchroniser {totalQR} Q/R → RAG
              </>
            )}
          </button>
          {totalQR === 0 && !isLoadingStats && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Aucune Q/R disponible — collectez d&apos;abord des données.
            </p>
          )}
        </div>

        {/* Go to Collecte Manuelle */}
        <div className="border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Collecte Manuelle de Q/R
            </h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Ajoutez, éditez ou importez des paires Question/Réponse dans la base de collecte.
            Plus vos données sont nombreuses et précises, plus le RAG sera performant.
          </p>
          <Link
            href="/training?tab=manual"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all"
          >
            <BookOpen className="w-4 h-4" />
            Aller à la Collecte Manuelle
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Link>
        </div>
      </div>

      {/* Sync Result */}
      {syncResult && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold mb-3">
            <CheckCircle2 className="w-5 h-5" />
            Indexation RAG terminée avec succès !
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Q/R indexées</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{syncResult.indexedCount}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Anciennes supprimées</p>
              <p className="text-xl font-bold text-gray-600 dark:text-gray-300">{syncResult.deletedCount}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Collections touchées</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{Object.keys(syncResult.zoneDistribution).length}</p>
            </div>
          </div>
          {Object.keys(syncResult.zoneDistribution).length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
                Répartition par collection ChromaDB :
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(syncResult.zoneDistribution).map(([zone, count]) => (
                  <span
                    key={zone}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  >
                    {zone}: {count as number} Q/R
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync Error */}
      {syncError && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 p-4 flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 dark:text-red-400 font-semibold text-sm">Erreur de synchronisation</p>
            <p className="text-red-600 dark:text-red-300 text-xs mt-1">{syncError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
