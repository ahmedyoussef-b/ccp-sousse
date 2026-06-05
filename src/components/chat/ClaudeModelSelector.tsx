'use client';

/**
 * @fileOverview Composant de sélection de modèle Claude-Local
 * @description Interface premium pour choisir le modèle Ollama actif,
 *              voir son statut en temps réel, et afficher les métriques.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface ModelInfo {
  id: string;
  name: string;
  display_name: string;
  claude_alias: string;
  type: 'fast' | 'balanced' | 'powerful' | 'vision';
  quality_score: number;
  speed_score: number;
  ram_mb: number;
  description: string;
  recommended: boolean;
  available: boolean;
}

interface ModelSelectorProps {
  selectedModel?: string;
  onModelChange?: (modelId: string, claudeAlias: string) => void;
  selectedProfile?: 'eco' | 'balanced' | 'turbo';
  onProfileChange?: (profile: 'eco' | 'balanced' | 'turbo') => void;
  className?: string;
  compact?: boolean;
}

// ============================================================================
// UTILITAIRES
// ============================================================================

function formatRam(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} Go`;
  return `${mb} Mo`;
}

function getScoreColor(score: number): string {
  if (score >= 0.9) return '#22c55e';
  if (score >= 0.75) return '#f59e0b';
  return '#ef4444';
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    fast: '⚡',
    balanced: '⚖️',
    powerful: '🧠',
    vision: '👁️'
  };
  return icons[type] || '🤖';
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    fast: 'Rapide',
    balanced: 'Équilibré',
    powerful: 'Puissant',
    vision: 'Vision'
  };
  return labels[type] || type;
}

// ============================================================================
// COMPOSANT BARRE DE PROGRESSION
// ============================================================================

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '10px',
        color: 'rgba(255,255,255,0.5)',
        marginBottom: '2px'
      }}>
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div style={{
        height: '4px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '100%',
          width: `${value * 100}%`,
          background: color,
          borderRadius: '2px',
          transition: 'width 0.6s ease'
        }} />
      </div>
    </div>
  );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function ClaudeModelSelector({
  selectedModel,
  onModelChange,
  selectedProfile = 'balanced',
  onProfileChange,
  className = '',
  compact = false
}: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>(selectedModel || '');
  const [isOpen, setIsOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // --------------------------------------------------------------------------
  // Chargement des modèles
  // --------------------------------------------------------------------------

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOllamaStatus('checking');

    try {
      const res = await fetch('/api/chat/claude-compatible/models');
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Ollama indisponible');
        setOllamaStatus('offline');
        setModels([]);
        return;
      }

      setModels(data.models || []);
      setOllamaStatus('online');

      // Sélectionner automatiquement le modèle recommandé si aucun n'est choisi
      if (!activeModel && data.best_model) {
        setActiveModel(data.best_model);
      }

    } catch (err: any) {
      setError('Impossible de contacter Ollama');
      setOllamaStatus('offline');
    } finally {
      setLoading(false);
    }
  }, [activeModel]);

  useEffect(() => {
    loadModels();
    // Rafraîchissement toutes les 30s
    const interval = setInterval(loadModels, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  // --------------------------------------------------------------------------
  // Sélection de modèle
  // --------------------------------------------------------------------------

  const handleSelect = (model: ModelInfo) => {
    setActiveModel(model.id);
    setTestResult(null);
    setIsOpen(false);
    if (onModelChange) {
      onModelChange(model.id, model.claude_alias);
    }
  };

  // --------------------------------------------------------------------------
  // Test du modèle sélectionné
  // --------------------------------------------------------------------------

  const handleTest = async () => {
    if (!activeModel || testing) return;
    setTesting(true);
    setTestResult(null);

    const startTime = Date.now();

    try {
      const res = await fetch('/api/chat/claude-compatible', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: models.find(m => m.id === activeModel)?.claude_alias || 'claude-sonnet',
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Réponds juste : "AGENTIC OK ✅"' }],
          system: `Utilise le modèle Ollama: ${activeModel}`
        })
      });

      const data = await res.json();
      const duration = Date.now() - startTime;

      if (res.ok && data.content?.[0]?.text) {
        setTestResult(`✅ ${data.content[0].text.substring(0, 80)} (${duration}ms)`);
      } else {
        setTestResult(`❌ ${data.error?.message || 'Erreur inattendue'}`);
      }
    } catch (err: any) {
      setTestResult(`❌ ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Modèle actif sélectionné
  // --------------------------------------------------------------------------

  const currentModel = models.find(m => m.id === activeModel);

  // ============================================================================
  // RENDU — Mode compact
  // ============================================================================

  if (compact) {
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'rgba(99, 102, 241, 0.15)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          borderRadius: '20px',
          cursor: 'pointer',
          fontSize: '13px',
          color: '#a5b4fc',
          transition: 'all 0.2s'
        }}
        onClick={() => setIsOpen(!isOpen)}
        title="Changer de modèle"
      >
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: ollamaStatus === 'online' ? '#22c55e' : '#ef4444',
          display: 'inline-block',
          boxShadow: ollamaStatus === 'online' ? '0 0 6px #22c55e' : 'none'
        }} />
        <span>🤖 {currentModel?.display_name || 'Choisir modèle'}</span>
        <span style={{ opacity: 0.5 }}>▾</span>
      </div>
    );
  }

  // ============================================================================
  // RENDU — Mode complet
  // ============================================================================

  return (
    <div className={className} style={{ position: 'relative', fontFamily: "'Inter', sans-serif" }}>

      {/* ---- En-tête avec statut Ollama ---- */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: ollamaStatus === 'online' ? '#22c55e'
                       : ollamaStatus === 'offline' ? '#ef4444' : '#f59e0b',
            boxShadow: ollamaStatus === 'online'
              ? '0 0 10px rgba(34,197,94,0.6)'
              : ollamaStatus === 'checking'
              ? '0 0 10px rgba(245,158,11,0.6)'
              : 'none',
            animation: ollamaStatus === 'checking' ? 'pulse 1s infinite' : 'none'
          }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
            Ollama {ollamaStatus === 'online' ? '— En ligne' : ollamaStatus === 'checking' ? '— Connexion...' : '— Hors ligne'}
          </span>
        </div>

        <button
          onClick={loadModels}
          disabled={loading}
          type="button"
          style={{
            padding: '4px 10px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {loading ? '⏳' : '🔄'} Actualiser
        </button>
      </div>

      {/* ---- Profils de Puissance (Dynamic BitNet) ---- */}
      <div style={{
        marginBottom: '20px',
        padding: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          ⚡ Profil de Puissance
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { id: 'eco', label: 'ÉCO', icon: '🔋', color: '#10b981', desc: 'RAM/Énergie min' },
            { id: 'balanced', label: 'BALANCÉ', icon: '⚖️', color: '#6366f1', desc: 'Usage normal' },
            { id: 'turbo', label: 'TURBO', icon: '🚀', color: '#f59e0b', desc: 'BitNet Max Speed' }
          ].map(p => {
            const isSelected = selectedProfile === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onProfileChange?.(p.id as any)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '10px 4px',
                  background: isSelected ? `${p.color}22` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? p.color : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '16px', marginBottom: '4px' }}>{p.icon}</span>
                <span style={{ fontSize: '10px', fontWeight: 800, color: isSelected ? 'white' : 'rgba(255,255,255,0.5)' }}>{p.label}</span>
                <span style={{ fontSize: '8px', opacity: 0.5, marginTop: '2px', textAlign: 'center' }}>{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Erreur ---- */}
      {error && !loading && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '10px',
          fontSize: '13px',
          color: '#fca5a5',
          marginBottom: '16px'
        }}>
          ❌ {error}
          <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
            Vérifiez qu'Ollama est actif : <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: '3px' }}>ollama serve</code>
          </div>
        </div>
      )}

      {/* ---- Loader ---- */}
      {loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '24px',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '14px'
        }}>
          <div style={{
            width: '20px', height: '20px',
            border: '2px solid rgba(99,102,241,0.3)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          Chargement des modèles...
        </div>
      )}

      {/* ---- Grille des modèles ---- */}
      {!loading && models.length > 0 && (
        <div style={{
          display: 'grid',
          gap: '10px',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))'
        }}>
          {models.map(model => {
            const isSelected = activeModel === model.id;
            return (
              <div
                key={model.id}
                onClick={() => handleSelect(model)}
                style={{
                  padding: '14px 16px',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))'
                    : 'rgba(255,255,255,0.03)',
                  border: isSelected
                    ? '1px solid rgba(99,102,241,0.6)'
                    : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                  }
                }}
              >
                {/* Badge recommandé */}
                {model.recommended && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '2px 8px',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    borderRadius: '20px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'white',
                    letterSpacing: '0.5px'
                  }}>
                    ✦ RECOMMANDÉ
                  </div>
                )}

                {/* En-tête modèle */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '22px' }}>{getTypeIcon(model.type)}</span>
                  <div>
                    <div style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: isSelected ? '#c4b5fd' : 'rgba(255,255,255,0.85)',
                      marginBottom: '2px'
                    }}>
                      {model.display_name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                      {getTypeIcon(model.type)} {getTypeLabel(model.type)} — {formatRam(model.ram_mb)} RAM
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.45)',
                  marginBottom: '10px',
                  lineHeight: '1.4'
                }}>
                  {model.description}
                </div>

                {/* Barres de score */}
                <ScoreBar
                  label="Qualité"
                  value={model.quality_score}
                  color={getScoreColor(model.quality_score)}
                />
                <ScoreBar
                  label="Vitesse"
                  value={model.speed_score}
                  color={getScoreColor(model.speed_score)}
                />

                {/* Alias Claude */}
                <div style={{
                  marginTop: '8px',
                  fontSize: '10px',
                  color: 'rgba(99,102,241,0.7)',
                  fontFamily: 'monospace'
                }}>
                  → {model.claude_alias}
                </div>

                {/* Indicateur sélectionné */}
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    bottom: '0',
                    left: '0',
                    right: '0',
                    height: '2px',
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)'
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Aucun modèle ---- */}
      {!loading && models.length === 0 && !error && (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '14px'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
          <div>Aucun modèle installé</div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: 'rgba(255,255,255,0.3)' }}>
            Installez un modèle avec :<br />
            <code style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '4px 8px',
              borderRadius: '4px',
              display: 'inline-block',
              marginTop: '4px'
            }}>
              ollama pull gemma2:2b
            </code>
          </div>
        </div>
      )}

      {/* ---- Modèle actif + bouton test ---- */}
      {currentModel && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
            <span style={{ color: '#a5b4fc', fontWeight: 500 }}>Actif :</span>{' '}
            {currentModel.display_name}
            <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: '8px' }}>
              via {currentModel.claude_alias}
            </span>
          </div>

          <button
            onClick={handleTest}
            disabled={testing}
            style={{
              padding: '6px 14px',
              background: testing
                ? 'rgba(99,102,241,0.1)'
                : 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))',
              border: '1px solid rgba(99,102,241,0.4)',
              borderRadius: '8px',
              color: testing ? 'rgba(165,180,252,0.5)' : '#a5b4fc',
              fontSize: '12px',
              cursor: testing ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
          >
            {testing ? '⏳ Test...' : '🧪 Tester'}
          </button>
        </div>
      )}

      {/* ---- Résultat test ---- */}
      {testResult && (
        <div style={{
          marginTop: '8px',
          padding: '10px 14px',
          background: testResult.startsWith('✅')
            ? 'rgba(34,197,94,0.08)'
            : 'rgba(239,68,68,0.08)',
          border: `1px solid ${testResult.startsWith('✅') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: '8px',
          fontSize: '12px',
          color: testResult.startsWith('✅') ? '#86efac' : '#fca5a5',
          fontFamily: 'monospace'
        }}>
          {testResult}
        </div>
      )}

      {/* ---- Badge "100% gratuit" ---- */}
      <div style={{
        marginTop: '16px',
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap'
      }}>
        {['✅ 100% Gratuit', '🔒 Hors-ligne', '⚡ Sans limite', '🔒 Données locales'].map(badge => (
          <span key={badge} style={{
            padding: '3px 10px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.4)'
          }}>
            {badge}
          </span>
        ))}
      </div>

      {/* ---- Animations CSS globales ---- */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
