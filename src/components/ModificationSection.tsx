import React, { useState, forwardRef } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

interface ModificationSectionProps {
  onModify: (prompt: string) => void;
  isLoading: boolean;
}

const QUICK_MODIFICATIONS = [
  'Сделай кнопки крупнее',
  'Уменьши скорость движения',
  'Увеличь скорость игры',
  'Сделай цвета ярче и контрастнее',
  'Добавь больше очков за победу',
];

export const ModificationSection = forwardRef<HTMLDivElement, ModificationSectionProps>(
  ({ onModify, isLoading }, ref) => {
    const [modificationText, setModificationText] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!modificationText.trim() || isLoading) return;
      onModify(modificationText.trim());
      setModificationText('');
    };

    const handleApplyQuick = (text: string) => {
      setModificationText(text);
    };

    return (
      <section
        ref={ref}
        id="modification-section"
        className="bg-white border border-neutral-200/90 dark:bg-neutral-800 dark:border-neutral-700/80 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 transition-colors"
      >
        <div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
            Изменить игру
          </h3>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Хотите что-то исправить? Напишите пожелание — ИИ аккуратно обновит игру.
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="modify-input"
              type="text"
              value={modificationText}
              onChange={(e) => setModificationText(e.target.value)}
              disabled={isLoading}
              placeholder="Например: сделай кнопки больше, добавь 5 жизней..."
              className="flex-1 bg-neutral-50 border border-neutral-300 dark:bg-neutral-900/90 dark:border-neutral-700 dark:text-white dark:placeholder:text-neutral-500 rounded-xl px-4 py-3 text-sm sm:text-base text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:bg-white dark:focus:bg-neutral-900 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 transition-all disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={isLoading || !modificationText.trim()}
              className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-sm sm:text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-4 h-4 fill-neutral-950" />
              <span>{isLoading ? 'Обновляем...' : 'Применить изменения'}</span>
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-neutral-400 dark:text-neutral-400 mr-1">Подсказки:</span>
            {QUICK_MODIFICATIONS.map((quick, i) => (
              <button
                key={i}
                type="button"
                disabled={isLoading}
                onClick={() => handleApplyQuick(quick)}
                className="text-xs px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 dark:bg-neutral-700/80 dark:hover:bg-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer disabled:opacity-40"
              >
                + {quick}
              </button>
            ))}
          </div>
        </form>
      </section>
    );
  }
);

ModificationSection.displayName = 'ModificationSection';
