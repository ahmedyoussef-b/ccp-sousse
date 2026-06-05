import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FormattedDescriptionProps {
  text: string;
  className?: string;
  maxInitialLines?: number;
}

/**
 * Composant pour transformer une description Markdown brute en HTML structuré et stylisé.
 * Sécurisé contre XSS (n'utilise pas dangerouslySetInnerHTML).
 * Inclut une option "Voir plus" pour les descriptions longues.
 */
const FormattedDescription: React.FC<FormattedDescriptionProps> = ({ text, className = "", maxInitialLines = 8 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!text) return null;

  const lines = text.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];

  const shouldShowReadMore = lines.length > maxInitialLines;

  const processInline = (line: string) => {
    const parts = line.split(/(\*\*.*?\*\*|__.*?__)/g);
    
    return parts.map((part, i) => {
      if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
        const innerText = part.slice(2, -2);
        return (
          <strong key={i} className="text-amber-400 font-bold">
            {innerText}
          </strong>
        );
      }
      return part;
    });
  };

  const flushList = () => {
    if (currentListItems.length > 0) {
      renderedElements.push(
        <ul key={`list-${renderedElements.length}`} className="my-3 space-y-2 list-none">
          {currentListItems}
        </ul>
      );
      currentListItems = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('### ')) {
      flushList();
      renderedElements.push(
        <div key={`h3-${index}`} className="mt-6 mb-3 group">
          <h3 className="text-indigo-400 font-bold text-lg flex items-center gap-2">
            <span className="text-indigo-500/80 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]">📌</span>
            {processInline(trimmedLine.slice(4))}
          </h3>
          <div className="h-px w-full bg-gradient-to-r from-indigo-500/40 via-indigo-500/10 to-transparent mt-1" />
        </div>
      );
    } else if (trimmedLine.startsWith('## ')) {
      flushList();
      renderedElements.push(
        <div key={`h2-${index}`} className="mt-8 mb-4">
          <h2 className="text-white font-extrabold text-xl flex items-center gap-3 uppercase tracking-tight">
            <span className="text-blue-400">📌</span>
            {processInline(trimmedLine.slice(3))}
          </h2>
          <div className="h-0.5 w-1/3 bg-gradient-to-r from-blue-500/50 to-transparent mt-1" />
        </div>
      );
    } else if (trimmedLine.startsWith('# ')) {
      flushList();
      renderedElements.push(
        <div key={`h1-${index}`} className="mt-10 mb-6">
          <h1 className="text-white font-black text-2xl flex items-center gap-3 uppercase tracking-widest bg-white/5 p-3 rounded-lg border-l-4 border-indigo-500">
            <span>📌</span>
            {processInline(trimmedLine.slice(2))}
          </h1>
        </div>
      );
    } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      currentListItems.push(
        <li key={`li-${index}`} className="flex items-start gap-2 text-gray-300 leading-relaxed">
          <span className="text-amber-500 mt-1.5 shrink-0 text-[10px]">●</span>
          <span>{processInline(trimmedLine.slice(2))}</span>
        </li>
      );
    } else if (trimmedLine === '') {
      flushList();
      renderedElements.push(<div key={`br-${index}`} className="h-4" />);
    } else {
      flushList();
      renderedElements.push(
        <p key={`p-${index}`} className="text-gray-300 leading-relaxed mb-2 last:mb-0">
          {processInline(line)}
        </p>
      );
    }
  });

  flushList();

  return (
    <div className={`formatted-description text-sm md:text-base ${className}`}>
      <div className={`relative transition-all duration-500 ease-in-out overflow-hidden ${!isExpanded && shouldShowReadMore ? 'max-h-[250px]' : 'max-h-full'}`}>
        {renderedElements}
        
        {!isExpanded && shouldShowReadMore && (
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/80 to-transparent pointer-events-none z-10" />
        )}
      </div>

      {shouldShowReadMore && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 hover:text-indigo-300 bg-indigo-500/5 hover:bg-indigo-500/10 px-4 py-2 rounded-full border border-indigo-500/20 transition-all group"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" />
              Réduire la description
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
              Voir plus (détails complets)
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default FormattedDescription;
