// components/reference/ReferenceEnrichment.tsx

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Edit, 
  Save, 
  Trash2, 
  Link, 
  Tag, 
  ChevronRight,
  ChevronDown,
  ImageIcon,
  FolderTree,
  Hash,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReferenceNode {
  zone_id: string;
  zone_name: string;
  zone_description?: string;
  circuits?: CircuitNode[];
}

interface CircuitNode {
  circuit_id: string;
  circuit_name: string;
  circuit_description?: string;
  parametres?: ParametreNode[];
  imageCount?: number;
}

interface ParametreNode {
  parametre_id: string;
  parametre_name: string;
  parametre_type?: string;
  unite?: string;
}

export function ReferenceEnrichment() {
  const [zones, setZones] = useState<ReferenceNode[]>([]);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [expandedCircuits, setExpandedCircuits] = useState<Set<string>>(new Set());
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [editingCircuit, setEditingCircuit] = useState<string | null>(null);
  const [editingParametre, setEditingParametre] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState<{ entity_type: string; entity_id: string; alias: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string; name: string } | null>(null);
  const [linkedImages, setLinkedImages] = useState<any[]>([]);

  // Charger l'arborescence
  useEffect(() => {
    loadReference();
  }, []);

  const loadReference = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/reference/enrich');
      const data = await response.json();
      setZones(data.zones || []);
    } catch (error) {
      console.error('Erreur chargement référence:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleZone = (zoneId: string) => {
    const newExpanded = new Set(expandedZones);
    if (newExpanded.has(zoneId)) {
      newExpanded.delete(zoneId);
    } else {
      newExpanded.add(zoneId);
    }
    setExpandedZones(newExpanded);
  };

  const toggleCircuit = (circuitId: string) => {
    const newExpanded = new Set(expandedCircuits);
    if (newExpanded.has(circuitId)) {
      newExpanded.delete(circuitId);
    } else {
      newExpanded.add(circuitId);
    }
    setExpandedCircuits(newExpanded);
  };

  const updateZone = async (zoneId: string, updates: { zone_name: string; zone_description: string }) => {
    await fetch('/api/reference/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateZone',
        data: { zone_id: zoneId, ...updates, created_by: 'user' }
      })
    });
    await loadReference();
    setEditingZone(null);
  };

  const loadLinkedImages = async (entityType: string, entityId: string) => {
    const response = await fetch(`/api/vision/images?${entityType}_id=${entityId}`);
    const data = await response.json();
    setLinkedImages(data.images || []);
  };

  const handleSelectEntity = (type: string, id: string, name: string) => {
    setSelectedEntity({ type, id, name });
    loadLinkedImages(type, id);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderTree className="h-6 w-6 text-blue-500" />
          Enrichissement de la Référence Constructeur
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Gérez la hiérarchie Zone → Circuit → Paramètre et associez les images
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Panneau gauche - Arborescence */}
        <div className="w-1/2 border-r overflow-auto p-4">
          <div className="mb-4 flex justify-between items-center">
            <h2 className="font-semibold text-lg">📐 Hiérarchie</h2>
            <Button size="sm" onClick={() => setEditingZone('new')}>
              <Plus className="h-4 w-4 mr-1" /> Nouvelle Zone
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : (
            <div className="space-y-2">
              {zones.map((zone) => (
                <div key={zone.zone_id} className="border rounded-lg">
                  {/* Zone Header */}
                  <div 
                    className={cn(
                      "flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg",
                      editingZone === zone.zone_id && "bg-blue-50 dark:bg-blue-900/20"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1" onClick={() => toggleZone(zone.zone_id)}>
                      {expandedZones.has(zone.zone_id) ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                      <div className="p-1 bg-blue-100 dark:bg-blue-900 rounded">
                        <Hash className="h-4 w-4 text-blue-600" />
                      </div>
                      {editingZone === zone.zone_id ? (
                        <div className="flex-1 flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Input 
                            defaultValue={zone.zone_name}
                            placeholder="Nom de la zone"
                            className="h-8 text-sm"
                            id={`zone-name-${zone.zone_id}`}
                          />
                          <Input 
                            defaultValue={zone.zone_description || ''}
                            placeholder="Description"
                            className="h-8 text-sm"
                            id={`zone-desc-${zone.zone_id}`}
                          />
                          <Button size="sm" onClick={() => {
                            const name = (document.getElementById(`zone-name-${zone.zone_id}`) as HTMLInputElement).value;
                            const desc = (document.getElementById(`zone-desc-${zone.zone_id}`) as HTMLInputElement).value;
                            updateZone(zone.zone_id, { zone_name: name, zone_description: desc });
                          }}>
                            <Save className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div 
                            className="flex-1 cursor-pointer"
                            onClick={() => handleSelectEntity('zone', zone.zone_id, zone.zone_name)}
                          >
                            <span className="font-mono font-bold">{zone.zone_id}</span>
                            <span className="ml-2 text-gray-600">{zone.zone_name}</span>
                            {zone.zone_description && (
                              <span className="ml-2 text-xs text-gray-400">— {zone.zone_description}</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setEditingZone(zone.zone_id); }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleSelectEntity('zone', zone.zone_id, zone.zone_name); }}
                            >
                              <ImageIcon className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Circuits (expandable) */}
                  {expandedZones.has(zone.zone_id) && zone.circuits && (
                    <div className="ml-8 pl-4 border-l space-y-2 mt-2 mb-2">
                      {zone.circuits.map((circuit) => (
                        <div key={circuit.circuit_id} className="border rounded-lg">
                          <div 
                            className={cn(
                              "flex items-center justify-between p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800",
                              editingCircuit === circuit.circuit_id && "bg-green-50 dark:bg-green-900/20"
                            )}
                          >
                            <div className="flex items-center gap-2 flex-1" onClick={() => toggleCircuit(circuit.circuit_id)}>
                              {expandedCircuits.has(circuit.circuit_id) ? 
                                <ChevronDown className="h-3 w-3" /> : 
                                <ChevronRight className="h-3 w-3" />
                              }
                              <div className="p-0.5 bg-green-100 dark:bg-green-900 rounded">
                                <Tag className="h-3 w-3 text-green-600" />
                              </div>
                              {editingCircuit === circuit.circuit_id ? (
                                <div className="flex-1 flex gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Input 
                                    defaultValue={circuit.circuit_name}
                                    placeholder="Nom du circuit"
                                    className="h-7 text-xs"
                                    id={`circuit-name-${circuit.circuit_id}`}
                                  />
                                  <Input 
                                    defaultValue={circuit.circuit_description || ''}
                                    placeholder="Description"
                                    className="h-7 text-xs"
                                    id={`circuit-desc-${circuit.circuit_id}`}
                                  />
                                  <Button size="sm" onClick={() => {
                                    // updateCircuit logic
                                    setEditingCircuit(null);
                                  }}>
                                    <Save className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <div 
                                    className="flex-1 cursor-pointer"
                                    onClick={() => handleSelectEntity('circuit', circuit.circuit_id, circuit.circuit_name)}
                                  >
                                    <span className="font-mono font-medium text-sm">{circuit.circuit_id}</span>
                                    <span className="ml-2 text-sm text-gray-600">{circuit.circuit_name}</span>
                                    {circuit.circuit_description && (
                                      <span className="ml-2 text-xs text-gray-400">— {circuit.circuit_description}</span>
                                    )}
                                    {circuit.imageCount !== undefined && circuit.imageCount > 0 && (
                                      <Badge variant="secondary" className="ml-2 text-xs">
                                        {circuit.imageCount} img
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="sm">
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                      <ImageIcon className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Paramètres */}
                          {expandedCircuits.has(circuit.circuit_id) && circuit.parametres && (
                            <div className="ml-8 pl-4 border-l space-y-1 mt-2 mb-2">
                              {circuit.parametres.map((param) => (
                                <div 
                                  key={param.parametre_id}
                                  className="flex items-center justify-between p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
                                  onClick={() => handleSelectEntity('parametre', param.parametre_id, param.parametre_name)}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="p-0.5 bg-purple-100 dark:bg-purple-900 rounded">
                                      <Link className="h-3 w-3 text-purple-600" />
                                    </div>
                                    <span className="font-mono text-xs">{param.parametre_id}</span>
                                    <span className="text-xs text-gray-600">{param.parametre_name}</span>
                                    {param.parametre_type && (
                                      <Badge variant="outline" className="text-xs">
                                        {param.parametre_type}
                                      </Badge>
                                    )}
                                  </div>
                                  <Button variant="ghost" size="sm">
                                    <ImageIcon className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="w-full text-xs"
                                onClick={() => setEditingParametre('new')}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Ajouter un paramètre
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        onClick={() => setEditingCircuit('new')}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Ajouter un circuit
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panneau droit - Détail et Images liées */}
        <div className="w-1/2 overflow-auto p-4">
          {selectedEntity ? (
            <div className="space-y-4">
              {/* En-tête entité */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge className="mb-2">
                        {selectedEntity.type === 'zone' && '🏭 Zone'}
                        {selectedEntity.type === 'circuit' && '🔌 Circuit'}
                        {selectedEntity.type === 'parametre' && '📊 Paramètre'}
                      </Badge>
                      <CardTitle className="font-mono">{selectedEntity.id}</CardTitle>
                      <p className="text-gray-500 text-sm mt-1">{selectedEntity.name}</p>
                    </div>
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-1" /> Modifier
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Ajout d'alias */}
                  <div className="mb-4">
                    <label className="text-sm font-medium">🏷️ Alias / Synony</label>
                    <div className="flex gap-2 mt-1">
                      <Input placeholder="Nouvel alias (ex: Groupe Secours)" className="flex-1" />
                      <Button size="sm">Ajouter</Button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary">GSE</Badge>
                      <Badge variant="secondary">Groupe Secours</Badge>
                      <Badge variant="secondary">Emergency</Badge>
                    </div>
                  </div>

                  {/* Relation sémantique */}
                  <div className="mb-4">
                    <label className="text-sm font-medium">🔗 Relations sémantiques</label>
                    <div className="flex gap-2 mt-1">
                      <select className="border rounded px-2 py-1 text-sm">
                        <option>ALIMENTE</option>
                        <option>CONTROLE</option>
                        <option>PROTEGE</option>
                        <option>DETECTE</option>
                      </select>
                      <Input placeholder="Entité cible" className="flex-1" />
                      <Button size="sm">Ajouter</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Images liées */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">🖼️ Images associées</CardTitle>
                </CardHeader>
                <CardContent>
                  {linkedImages.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Aucune image associée à cet ID</p>
                      <p className="text-sm">Utilisez l'upload pour lier des images</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {linkedImages.map((img) => (
                        <div key={img.id} className="border rounded-lg overflow-hidden">
                          <img 
                            src={`/api/vision/images/${img.id}?type=thumbnail`} 
                            alt={img.filename}
                            className="w-full h-24 object-cover"
                          />
                          <div className="p-2 text-xs">
                            <p className="font-mono truncate">{img.filename}</p>
                            <p className="text-gray-500">{img.type || 'simple'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <FolderTree className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p>Sélectionnez une zone, un circuit ou un paramètre</p>
              <p className="text-sm">pour voir les détails et les images associées</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}