import React from 'react';
import { Loader2 } from 'lucide-react';
import { GenerationStage } from '../types.ts';

interface StatusIndicatorProps {
  stage: GenerationStage;
  customMessage?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ stage, customMessage }) => {
  if (stage === 'idle') return null;

  return (
    <div className="bg-white border border-amber-300 dark:bg-neutral-800 dark:border-amber-400/70 rounded-2xl p-4 shadow-sm flex items-center gap-3 animate-in fade-in duration-200 transition-colors">
      <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-neutral-900 dark:text-white">
          ИИ создаёт игру...
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
          {customMessage || 'Генерируется автономная игра...'}
        </p>
      </div>
    </div>
  );
};
