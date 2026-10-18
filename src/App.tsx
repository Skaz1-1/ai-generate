import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { PromptSection } from './components/PromptSection.tsx';
import { StatusIndicator } from './components/StatusIndicator.tsx';
import { GamePreview } from './components/GamePreview.tsx';
import { ModificationSection } from './components/ModificationSection.tsx';
import { GameVersion, GenerationOptions, GenerationStage } from './types.ts';
import { STARTER_GAME_HTML } from './utils/starterGame.ts';
import { AlertCircle, X, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<GenerationOptions>({
    audience: 'Любая',
    difficulty: 'Средняя',
  });

  const modificationRef = useRef<HTMLDivElement>(null);

  // History stack of generated game versions
  const [history, setHistory] = useState<GameVersion[]>([
    {
      id: 'starter',
      version: 1,
      prompt: 'Билайн Пакман: Сбор сот',
      html: STARTER_GAME_HTML,
      timestamp: new Date(),
      solvability: {
        passed: true,
        genre: 'collector',
        errors: [],
        warnings: [],
        details: { exitReachable: true, collectiblesTotal: 20, collectiblesReachable: 20 },
      },
    },
  ]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);

  // Generation state
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Server health state
  const [serverStatus, setServerStatus] = useState<{
    model: string;
    hasApiKey: boolean;
  } | null>(null);

  const currentVersion = history[currentVersionIndex] || history[0];
  const isLoading = stage !== 'idle' && stage !== 'ready' && stage !== 'error';

  // Check health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setServerStatus({
          model: data.model || 'gemini-3.8-flash',
          hasApiKey: Boolean(data.hasApiKey),
        });
      })
      .catch((err) => {
        console.warn('Серверный статус недоступен:', err);
      });
  }, []);

  // Handler: Generate new game
  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading) return;

    setErrorMessage(null);
    setSuccessToast(null);
    setStage('analyzing');
    setStatusMessage('Анализируем идею игры...');

    try {
      const timer = setTimeout(() => {
        setStage('coding');
        setStatusMessage('Создаём код игры, правила и управление...');
      }, 1200);

      const response = await fetch('/api/generate-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          audience: options.audience,
          difficulty: options.difficulty,
        }),
      });

      clearTimeout(timer);

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ошибка при генерации игры на сервере.');
      }

      setStage('validating');
      setStatusMessage('Запускаем игру...');

      const newVersion: GameVersion = {
        id: `gen-${Date.now()}`,
        version: history.length + 1,
        prompt: prompt.trim(),
        html: data.html,
        timestamp: new Date(),
        warnings: data.warnings,
        solvability: data.solvability,
        wasFixed: data.wasFixed,
        adaptationNotice: data.adaptationNotice,
      };

      setHistory((prev) => [...prev, newVersion]);
      setCurrentVersionIndex(history.length);
      setStage('ready');
      const fixNote = data.wasFixed ? ' (уровень автоматически скорректирован)' : '';
      setSuccessToast(`Игра создана! Готова Версия ${newVersion.version}${fixNote}.`);
      setTimeout(() => setStage('idle'), 1500);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      console.error(err);
      setStage('idle');
      setErrorMessage(
        err.message || 'Произошла непредвиденная ошибка при создании игры. Попробуйте еще раз.'
      );
    }
  };

  // Handler: Modify existing game
  const handleModify = async (modificationPrompt: string) => {
    if (!modificationPrompt.trim() || isLoading) return;

    setErrorMessage(null);
    setSuccessToast(null);
    setStage('analyzing');
    setStatusMessage('Вносим изменения в игру...');

    try {
      const timer = setTimeout(() => {
        setStage('coding');
        setStatusMessage('Обновляем код игры с сохранением правил...');
      }, 1200);

      const response = await fetch('/api/modify-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentHtml: currentVersion.html,
          modificationPrompt: modificationPrompt.trim(),
        }),
      });

      clearTimeout(timer);

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Не удалось применить изменения к игре.');
      }

      setStage('validating');
      setStatusMessage('Запускаем обновлённую игру...');

      const newVersion: GameVersion = {
        id: `mod-${Date.now()}`,
        version: history.length + 1,
        prompt: `${currentVersion.prompt} + [${modificationPrompt}]`,
        html: data.html,
        timestamp: new Date(),
        warnings: data.warnings,
        solvability: data.solvability,
        wasFixed: data.wasFixed,
      };

      setHistory((prev) => [...prev, newVersion]);
      setCurrentVersionIndex(history.length);
      setStage('ready');
      const fixNote = data.wasFixed ? ' (уровень проверен и скорректирован)' : '';
      setSuccessToast(`Изменения применены! Создана Версия ${newVersion.version}${fixNote}.`);
      setTimeout(() => setStage('idle'), 1500);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error(err);
      setStage('idle');
      setErrorMessage(
        `${err.message} Предыдущая версия игры сохранена без изменений.`
      );
    }
  };

  // Handler: Download standalone HTML
  const handleDownload = () => {
    if (!currentVersion || !currentVersion.html) return;

    const blob = new Blob([currentVersion.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedTitle = currentVersion.prompt
      .slice(0, 30)
      .replace(/[^a-zа-яё0-9]/gi, '_')
      .toLowerCase();
    link.download = `beeline_game_v${currentVersion.version}_${sanitizedTitle || 'game'}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Scroll to modify section
  const handleScrollToModify = () => {
    if (modificationRef.current) {
      modificationRef.current.scrollIntoView({ behavior: 'smooth' });
      const inputEl = document.getElementById('modify-input');
      if (inputEl) inputEl.focus();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100/70 text-neutral-900 flex flex-col font-sans selection:bg-amber-300 selection:text-neutral-950">
      {/* Brand Header */}
      <Header serverStatus={serverStatus} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Error Alert */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-3 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-sm">Не удалось выполнить действие</h5>
                <p className="text-xs sm:text-sm text-rose-700 mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-1 rounded-lg hover:bg-rose-100 text-rose-500 cursor-pointer"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Success Toast */}
        {successToast && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-sm font-semibold">{successToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessToast(null)}
              className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-600 cursor-pointer"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Section 1: Main Creator Screen */}
        <PromptSection
          prompt={prompt}
          setPrompt={setPrompt}
          options={options}
          setOptions={setOptions}
          onGenerate={handleGenerate}
          isLoading={isLoading}
        />

        {/* Section 2: Progress Indicator */}
        {isLoading && (
          <StatusIndicator stage={stage} customMessage={statusMessage} />
        )}

        {/* Section 3: Interactive Game Window (Hero Element) */}
        <GamePreview
          currentVersion={currentVersion}
          history={history}
          currentVersionIndex={currentVersionIndex}
          onSelectVersion={setCurrentVersionIndex}
          onDownload={handleDownload}
          onModifyClick={handleScrollToModify}
          isLoading={isLoading}
        />

        {/* Section 4: Game Tuning & Changes */}
        <ModificationSection
          ref={modificationRef}
          onModify={handleModify}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
}
