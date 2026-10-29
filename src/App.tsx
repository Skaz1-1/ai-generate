import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { PromptSection } from './components/PromptSection.tsx';
import { StatusIndicator } from './components/StatusIndicator.tsx';
import { GamePreview } from './components/GamePreview.tsx';
import { ModificationSection } from './components/ModificationSection.tsx';
import { GameVersion, GenerationOptions, GenerationStage } from './types.ts';
import { STARTER_GAME_HTML } from './utils/starterGame.ts';
import { AlertCircle, X, CheckCircle2, RotateCcw } from 'lucide-react';
import { classifyApiError, formatFriendlyErrorMessage } from './utils/errorMessage.ts';

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('beeline_theme');
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
  } catch (e) {
    // Ignore storage restriction
  }
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

const CLIENT_TIMEOUT_MS = 85000; // 85 секунд (согласовано с серверным лимитом 80с и 90с таймаутом прокси GFE)

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<GenerationOptions>({
    difficulty: 'Средняя',
    scale: 'medium',
  });

  const modificationRef = useRef<HTMLDivElement>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('beeline_theme', theme);
    } catch (e) {
      // Ignore
    }
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Clean up in-flight requests and timers on unmount
  useEffect(() => {
    return () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

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
        status: 'verified',
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
  const [errorContext, setErrorContext] = useState<'generate' | 'modify' | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
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
    setErrorContext('generate');
    setSuccessToast(null);
    setStage('analyzing');
    setStatusMessage('Анализируем идею игры...');

    // Quick client-side network check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStage('idle');
      const err = classifyApiError(new TypeError('Failed to fetch'));
      setErrorMessage(err.message);
      setRetryAction(() => () => handleGenerate());
      return;
    }

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    let timeoutId: NodeJS.Timeout | null = null;
    let stageTimer: NodeJS.Timeout | null = null;

    try {
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, CLIENT_TIMEOUT_MS);

      stageTimer = setTimeout(() => {
        setStage('coding');
        setStatusMessage('Создаём код игры, правила и управление...');
      }, 1200);
      transitionTimerRef.current = stageTimer;

      const response = await fetch('/api/generate-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          difficulty: options.difficulty,
          scale: options.scale,
        }),
        signal: abortController.signal,
      });

      if (stageTimer) {
        clearTimeout(stageTimer);
        stageTimer = null;
        transitionTimerRef.current = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      let data: any = null;
      let rawText = '';
      try {
        rawText = await response.text();
        data = rawText ? JSON.parse(rawText) : null;
      } catch (parseErr) {
        console.warn('Не удалось распарсить ответ сервера как JSON:', parseErr, rawText?.slice(0, 150));
      }

      if (!response.ok || !data?.success) {
        let errorToClassify: any;
        const msgCandidate = (typeof data?.error === 'string' && data.error.trim())
          ? data.error.trim()
          : (typeof data?.message === 'string' && data.message.trim())
          ? data.message.trim()
          : null;

        if (msgCandidate) {
          errorToClassify = {
            status: response.status,
            message: msgCandidate,
            code: data.code,
            retryable: data.retryable,
          };
        } else if (!data) {
          const isHtml = rawText.trim().toLowerCase().startsWith('<!doctype html') || rawText.includes('<html');
          if (isHtml) {
            console.warn('[Сервер] Получен HTML-ответ вместо JSON (статус ' + response.status + '):', rawText.slice(0, 300));
            const isGatewayTimeout =
              response.status === 504 ||
              rawText.includes('504') ||
              rawText.toLowerCase().includes('gateway timeout');
            errorToClassify = {
              status: isGatewayTimeout ? 504 : (response.status === 200 ? 502 : response.status),
              code: isGatewayTimeout ? 'TIMEOUT' : 'EMPTY_RESPONSE',
              message: isGatewayTimeout
                ? 'ИИ не успел создать игру за отведённое время. Попробуйте ещё раз.'
                : 'Сервер вернул страницу ошибки вместо ответа ИИ. Попробуйте ещё раз.',
              retryable: true,
            };
          } else {
            errorToClassify = {
              status: response.status === 200 ? 502 : response.status,
              code: 'EMPTY_RESPONSE',
              message: response.status === 200
                ? 'Сервер вернул некорректный или пустой ответ. Попробуйте ещё раз.'
                : (response.statusText || 'Не удалось получить ответ от сервера.'),
              retryable: true,
            };
          }
        } else {
          errorToClassify = {
            status: response.status,
            message: response.statusText || 'Не удалось завершить создание игры.',
            code: data.code,
            retryable: data.retryable ?? true,
          };
        }
        throw errorToClassify;
      }

      setStage('validating');
      setStatusMessage('Запускаем игру...');

      const newVersion: GameVersion = {
        id: `gen-${Date.now()}`,
        version: history.length + 1,
        prompt: prompt.trim(),
        html: data.html,
        timestamp: new Date(),
        scale: options.scale,
        warnings: data.warnings,
        solvability: data.solvability,
        wasFixed: data.wasFixed,
        adaptationNotice: data.adaptationNotice,
      };

      setHistory((prev) => [...prev, newVersion]);
      setCurrentVersionIndex(history.length);
      setStage('ready');
      const fixNote = data.wasFixed ? ' (уровень автоматически скорректирован)' : '';
      setSuccessToast(`Игра создана! Готова Игра ${newVersion.version}${fixNote}.`);
      setTimeout(() => setStage('idle'), 1500);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Ошибка создания игры:', err);
      setStage('idle');
      const classified = classifyApiError(err);
      setErrorMessage(classified.message);
      if (classified.retryable) {
        setRetryAction(() => () => handleGenerate());
      } else {
        setRetryAction(null);
      }
    } finally {
      if (stageTimer) clearTimeout(stageTimer);
      if (timeoutId) clearTimeout(timeoutId);
      transitionTimerRef.current = null;
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null;
      }
    }
  };

  // Handler: Modify existing game
  const handleModify = async (modificationPrompt: string) => {
    if (!modificationPrompt.trim() || isLoading) return;

    setErrorMessage(null);
    setErrorContext('modify');
    setSuccessToast(null);
    setStage('analyzing');
    setStatusMessage('Вносим изменения в игру...');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStage('idle');
      const err = classifyApiError(new TypeError('Failed to fetch'), { isModification: true });
      setErrorMessage(err.message);
      setRetryAction(() => () => handleModify(modificationPrompt));
      return;
    }

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    let timeoutId: NodeJS.Timeout | null = null;
    let stageTimer: NodeJS.Timeout | null = null;

    try {
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, CLIENT_TIMEOUT_MS);

      stageTimer = setTimeout(() => {
        setStage('coding');
        setStatusMessage('Обновляем код игры с сохранением правил...');
      }, 1200);
      transitionTimerRef.current = stageTimer;

      const response = await fetch('/api/modify-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentHtml: currentVersion.html,
          modificationPrompt: modificationPrompt.trim(),
          scale: currentVersion.scale || options.scale,
        }),
        signal: abortController.signal,
      });

      if (stageTimer) {
        clearTimeout(stageTimer);
        stageTimer = null;
        transitionTimerRef.current = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      let data: any = null;
      let rawText = '';
      try {
        rawText = await response.text();
        data = rawText ? JSON.parse(rawText) : null;
      } catch (parseErr) {
        console.warn('Не удалось распарсить ответ сервера как JSON:', parseErr, rawText?.slice(0, 150));
      }

      if (!response.ok || !data?.success) {
        let errorToClassify: any;
        const msgCandidate = (typeof data?.error === 'string' && data.error.trim())
          ? data.error.trim()
          : (typeof data?.message === 'string' && data.message.trim())
          ? data.message.trim()
          : null;

        if (msgCandidate) {
          errorToClassify = {
            status: response.status,
            message: msgCandidate,
            code: data.code,
            retryable: data.retryable,
            isModification: true,
          };
        } else if (!data) {
          const isHtml = rawText.trim().toLowerCase().startsWith('<!doctype html') || rawText.includes('<html');
          if (isHtml) {
            console.warn('[Сервер] Получен HTML-ответ вместо JSON (статус ' + response.status + '):', rawText.slice(0, 300));
            const isGatewayTimeout =
              response.status === 504 ||
              rawText.includes('504') ||
              rawText.toLowerCase().includes('gateway timeout');
            errorToClassify = {
              status: isGatewayTimeout ? 504 : (response.status === 200 ? 502 : response.status),
              code: isGatewayTimeout ? 'TIMEOUT' : 'EMPTY_RESPONSE',
              message: isGatewayTimeout
                ? 'ИИ не успел создать игру за отведённое время. Попробуйте ещё раз. Предыдущая версия игры сохранена без изменений.'
                : 'Сервер вернул страницу ошибки вместо ответа ИИ. Предыдущая версия игры сохранена без изменений.',
              retryable: true,
              isModification: true,
            };
          } else {
            errorToClassify = {
              status: response.status === 200 ? 502 : response.status,
              code: 'EMPTY_RESPONSE',
              message: response.status === 200
                ? 'Сервер вернул некорректный или пустой ответ. Предыдущая версия игры сохранена без изменений.'
                : (response.statusText || 'Не удалось получить ответ от сервера. Предыдущая версия игры сохранена без изменений.'),
              retryable: true,
              isModification: true,
            };
          }
        } else {
          errorToClassify = {
            status: response.status,
            message: response.statusText || 'Не удалось завершить модификацию игры.',
            code: data.code,
            retryable: data.retryable ?? true,
            isModification: true,
          };
        }
        throw errorToClassify;
      }

      setStage('validating');
      setStatusMessage('Запускаем обновлённую игру...');

      const newVersion: GameVersion = {
        id: `mod-${Date.now()}`,
        version: history.length + 1,
        prompt: `${currentVersion.prompt} + [${modificationPrompt}]`,
        html: data.html,
        timestamp: new Date(),
        scale: currentVersion.scale || options.scale,
        warnings: data.warnings,
        solvability: data.solvability,
        wasFixed: data.wasFixed,
      };

      setHistory((prev) => [...prev, newVersion]);
      setCurrentVersionIndex(history.length);
      setStage('ready');
      const fixNote = data.wasFixed ? ' (уровень автоматически скорректирован)' : '';
      setSuccessToast(`Изменения применены! Создана Игра ${newVersion.version}${fixNote}.`);
      setTimeout(() => setStage('idle'), 1500);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error('Ошибка изменения игры:', err);
      setStage('idle');
      const classified = classifyApiError(err, { isModification: true });
      setErrorMessage(classified.message);
      if (classified.retryable) {
        setRetryAction(() => () => handleModify(modificationPrompt));
      } else {
        setRetryAction(null);
      }
    } finally {
      if (stageTimer) clearTimeout(stageTimer);
      if (timeoutId) clearTimeout(timeoutId);
      transitionTimerRef.current = null;
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null;
      }
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

  // Retry handler
  const handleRetry = () => {
    if (retryAction) {
      setErrorMessage(null);
      retryAction();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100/70 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex flex-col font-sans selection:bg-amber-300 selection:text-neutral-950 transition-colors">
      {/* Brand Header */}
      <Header
        serverStatus={serverStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
        currentHtml={currentVersion?.html}
        currentGameTitle={`Игра ${currentVersion?.version || 1}: ${currentVersion?.prompt || 'Билайн Пакман'}`}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Error Alert */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 dark:bg-rose-950/60 dark:border-rose-900 dark:text-rose-200 flex items-start justify-between gap-3 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-sm">
                  {errorContext === 'modify' ? 'Не удалось изменить игру' : 'Не удалось создать игру'}
                </h5>
                <p className="text-xs sm:text-sm text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">{errorMessage}</p>
                {retryAction && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Попробовать снова
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setRetryAction(null);
              }}
              className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-500 cursor-pointer"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Success Toast */}
        {successToast && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-sm font-semibold">{successToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessToast(null)}
              className="p-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 cursor-pointer"
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
