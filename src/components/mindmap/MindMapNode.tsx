// src/components/mindmap/MindMapNode.tsx
import React from 'react';
import { Database, Cpu, GitMerge, FileText } from 'lucide-react';
import { MindMapNode as NodeData } from '@/ai/mindmap/types';

interface MindMapNodeProps {
  node: NodeData;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent, nodeId: string) => void;
  isHighlightedPath?: boolean; // Part of active navigation path
  isDimmed?: boolean;           // Dimmed out when another branch is focused
}

export const MindMapNode: React.FC<MindMapNodeProps> = ({
  node,
  isSelected,
  onClick,
  onDragStart,
  isHighlightedPath = false,
  isDimmed = false
}) => {
  // Determine color and icon theme based on type
  let colorClass = '';
  let borderClass = '';
  let glowClass = '';
  let Icon = FileText;

  switch (node.type) {
    case 'parameter':
      colorClass = 'bg-sky-950/80 text-sky-200';
      borderClass = 'border-sky-500/50';
      glowClass = 'shadow-[0_0_15px_rgba(14,165,233,0.15)]';
      Icon = Database;
      break;
    case 'formula':
      colorClass = 'bg-emerald-950/80 text-emerald-200';
      borderClass = 'border-emerald-500/50';
      glowClass = 'shadow-[0_0_15px_rgba(16,185,129,0.15)]';
      Icon = Cpu;
      break;
    case 'dependency':
      colorClass = 'bg-orange-950/80 text-orange-200';
      borderClass = 'border-orange-500/50';
      glowClass = 'shadow-[0_0_15px_rgba(249,115,22,0.15)]';
      Icon = GitMerge;
      break;
    default:
      colorClass = 'bg-slate-900/80 text-slate-200';
      borderClass = 'border-slate-700/50';
      glowClass = 'shadow-[0_0_10px_rgba(148,163,184,0.05)]';
      Icon = FileText;
  }

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.positionX ?? 100}px`,
    top: `${node.positionY ?? 100}px`,
    transform: 'translate(-50%, -50%)',
    cursor: onDragStart ? 'grab' : 'pointer',
    userSelect: 'none',
    opacity: isDimmed ? 0.15 : 1,
    pointerEvents: isDimmed ? 'none' : 'auto',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  };

  return (
    <div
      data-node-id={node.id}
      style={baseStyle}
      onClick={onClick}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart && onDragStart(e, node.id)}
      className={`
        flex items-center gap-3 px-4 py-2.5 rounded-xl border backdrop-blur-md
        transition-all duration-300 ease-out hover:scale-105 active:scale-95
        ${colorClass} ${borderClass} ${glowClass}
        ${isSelected ? 'ring-2 ring-orange-500 border-orange-500 scale-105 shadow-[0_0_20px_rgba(249,115,22,0.4)]' : ''}
        ${isHighlightedPath && !isSelected ? 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] ring-1 ring-amber-400/50' : ''}
      `}
    >
      <div className={`p-1.5 rounded-lg bg-white/5 border border-white/10 ${isHighlightedPath ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : ''}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex flex-col text-left max-w-[160px]">
        <span className={`font-semibold text-xs truncate ${isHighlightedPath ? 'text-amber-200' : ''}`}>{node.label}</span>
        {node.description && (
          <span className="text-[10px] opacity-60 truncate">
            {node.description}
          </span>
        )}
      </div>
    </div>
  );
};
export default MindMapNode;
