import React, { useState } from 'react';
import { Sparkles, SlidersHorizontal, ArrowRight, X, ChevronDown, ChevronUp } from 'lucide-react';
import { GenerationOptions, GameScale } from '../types.ts';

interface PromptSectionProps {
  prompt: string;
  setPrompt: (value: string) => void;
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  onGenerate: () => void;
  isLoading: boolean;
}

const PRESETS = [
  {
    title: '🐝 Медовая пчёлка',
    tag: 'Аркада',
    text: 'Красочная игра: весёлая пчёлка летает по поляне, собирает капли мёда и соты, уворачивается от серых тучек. Управление стрелками или нажатием на экран.',
  },
  {
    title: '🧠 Карточки на память',
    tag: 'Головоломка',
    text: 'Спокойный тренажёр памяти: очень крупные контрастные карточки с цифрами. Большие кнопки, без таймера и спешки, понятный крупный текст.',
  },
  {
    title: '⚡ Космо-лабиринт',
    tag: 'Лабиринт',
    text: 'Лабиринт: космический корабль собирает 10 энерго-кристаллов за 60 секунд. Удобные экранные кнопки и стрелки на клавиатуре.',
  },
];

export const PromptSection: React.FC<PromptSectionProps> = ({
  prompt,
  setPrompt,
  options,
  setOptions,
  onGenerate,
  isLoading,
}) => {
  const [showSettings, setShowSettings] = useState(false);

  const handleSelectPreset = (presetText: string) => {
    setPrompt(presetText);
  };

  return (
    <section className="bg-white border border-neutral-200/90 dark:bg-neutral-800 dark:border-neutral-700/80 rounded-2xl p-5 sm:p-7 shadow-sm space-y-5 transition-colors">
      {/* Title & Subtitle */}
      <div className="space-y-1 text-center sm:text-left">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
          Создай свою игру
        </h2>
        <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
          Опиши идею — ИИ превратит её в игру
        </p>
      </div>

      {/* Prominent Game Description Input */}
      <div className="space-y-2">
        <div className="relative">
          <textarea
            id="game-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            rows={4}
            placeholder="Какую игру вы хотите создать? Например: Пакман собирает монетки в лабиринте и уворачивается от привидений..."
            className="w-full bg-neutral-50/70 border border-neutral-300 dark:bg-neutral-900/90 dark:border-neutral-700 dark:text-white dark:placeholder:text-neutral-500 rounded-2xl pl-4 pr-12 sm:pr-14 py-3.5 text-base text-neutral-900 placeholder:text-neutral-600 focus:outline-none focus:bg-white dark:focus:bg-neutral-900 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 transition-all resize-y disabled:opacity-50"
          />
          {prompt && !isLoading && (
            <button
              type="button"
              onClick={() => setPrompt('')}
              className="absolute top-3 right-3 z-10 text-neutral-400 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 p-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm transition-colors cursor-pointer"
              title="Очистить поле"
              aria-label="Очистить поле ввода"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Primary CTA and Collapsible Settings Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Toggleable Settings Trigger */}
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className="text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors flex items-center justify-center sm:justify-start gap-1.5 py-2 px-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-600 cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
          <span>Настройки игры</span>
          {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {/* Big Yellow Button: «Создать игру» */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={isLoading || !prompt.trim()}
          className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-neutral-950 font-extrabold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-400/20"
        >
          <Sparkles className="w-5 h-5 fill-neutral-950" />
          <span>{isLoading ? 'ИИ создаёт игру...' : 'Создать игру'}</span>
          {!isLoading && <ArrowRight className="w-5 h-5 stroke-[2.5]" />}
        </button>
      </div>

      {/* Collapsible Block «Настройки игры» */}
      {showSettings && (
        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs animate-in fade-in duration-150">
          <div>
            <div className="text-neutral-700 dark:text-neutral-300 font-semibold mb-2">
              Масштаб игры:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: 'short', label: 'Короткая', hint: 'Один небольшой уровень или короткий раунд' },
                { value: 'medium', label: 'Средняя', hint: 'Несколько этапов (по умолчанию)' },
                { value: 'large', label: 'Большая', hint: 'Много этапов или уровней, долгое прохождение' },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setOptions((prev) => ({ ...prev, scale: s.value as GameScale }))}
                  title={s.hint}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                    options.scale === s.value
                      ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-amber-400 dark:text-neutral-950 dark:border-amber-400 font-bold'
                      : 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-400 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
              {options.scale === 'short' && 'Один небольшой уровень или короткий раунд'}
              {options.scale === 'medium' && 'Несколько этапов (сбалансированное прохождение)'}
              {options.scale === 'large' && 'Много этапов или уровней, продолжительное прохождение'}
            </p>
          </div>

          <div>
            <div className="text-neutral-700 dark:text-neutral-300 font-semibold mb-2">
              Сложность:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: 'Лёгкая', label: 'Лёгкая', hint: 'Меньше препятствий, спокойнее темп и проще условия победы' },
                { value: 'Средняя', label: 'Средняя', hint: 'Сбалансированные препятствия, темп и сложность' },
                { value: 'Сложная', label: 'Сложная', hint: 'Больше испытаний, выше требования к реакции или точности' },
              ].map((d) => {
                const isSelected =
                  options.difficulty === d.value ||
                  (d.value === 'Лёгкая' && options.difficulty === 'Легкая') ||
                  (d.value === 'Сложная' && options.difficulty === 'Высокая');
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setOptions((prev) => ({ ...prev, difficulty: d.value as any }))}
                    title={d.hint}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-amber-400 dark:text-neutral-950 dark:border-amber-400 font-bold'
                        : 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-400 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
              {(options.difficulty === 'Лёгкая' || options.difficulty === 'Легкая') && 'Меньше препятствий, спокойнее темп и проще условия победы'}
              {options.difficulty === 'Средняя' && 'Сбалансированные препятствия, темп и сложность'}
              {(options.difficulty === 'Сложная' || options.difficulty === 'Высокая') && 'Больше испытаний, выше требования к реакции или точности'}
            </p>
          </div>
        </div>
      )}

      {/* Compact Clickable Idea Presets */}
      <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700/60 space-y-2">
        <div className="text-xs text-neutral-600 dark:text-neutral-400 font-medium">
          Или выберите готовую идею:
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectPreset(p.text)}
              disabled={isLoading}
              className="text-left p-3 rounded-xl bg-neutral-50/80 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-neutral-700/40 dark:hover:border-amber-400 transition-all cursor-pointer disabled:opacity-40 group"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-bold text-neutral-900 dark:text-white group-hover:text-neutral-950 dark:group-hover:text-amber-400">
                  {p.title}
                </span>
                <span className="text-[10px] text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 px-1.5 py-0.5 rounded">
                  {p.tag}
                </span>
              </div>
              <p className="text-[11px] text-neutral-700 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                {p.text}
              </p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
