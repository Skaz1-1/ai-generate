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
    <div className="bg-white border border-amber-300 rounded-2xl p-4 shadow-sm flex items-center gap-3 animate-in fade-in duration-200">
      <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-neutral-900">
          ИИ создаёт игру...
        </div>
        <p className="text-xs text-neutral-600 truncate mt-0.5">
          {customMessage || 'Генерируется автономная игра...'}
        </p>
      </div>
    </div>
  );
};
