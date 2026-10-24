import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2,
  Sun,
  Moon,
  Menu,
  X,
  Code2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Cpu,
  Info,
} from 'lucide-react';

interface HeaderProps {
  serverStatus?: {
    model: string;
    hasApiKey: boolean;
  } | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  currentHtml?: string;
  currentGameTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  serverStatus,
  theme,
  onToggleTheme,
  currentHtml = '',
  currentGameTitle = 'Текущая игра',
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDevExpanded, setIsDevExpanded] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        setIsCodeModalOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        menuRef.current &&
        !menuRef.current.contains(target as Node) &&
        !target?.closest('button[aria-label*="тему"]')
      ) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen || isCodeModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen, isCodeModalOpen]);

  const handleCopyCode = async () => {
    if (!currentHtml) return;
    try {
      await navigator.clipboard.writeText(currentHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy code:', e);
    }
  };

  const handleOpenCodeModal = () => {
    setIsMenuOpen(false); // Close dropdown
    setIsCodeModalOpen(true); // Open modal
  };

  return (
    <header className="border-b border-neutral-200/80 bg-white/90 dark:bg-neutral-900/90 dark:border-neutral-800 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
        {/* Simple Brand identity */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center font-bold shadow-sm shrink-0">
            <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-1 sm:gap-1.5 truncate">
              <span>Билайн</span>
              <span className="text-amber-500 dark:text-amber-400 font-extrabold">ИИ-игры</span>
              <span className="text-neutral-400 font-normal text-xs sm:text-sm hidden xs:inline">от Пакман</span>
            </div>
          </div>
        </div>

        {/* Top Right Controls: Order: «ИИ готов» → переключатель темы → кнопка меню ☰ */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs shrink-0">
          {/* 1. Надпись «ИИ готов» */}
          <div className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-neutral-100 border border-neutral-200/80 text-neutral-600 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 shrink-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                serverStatus?.hasApiKey ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
              {serverStatus?.hasApiKey ? 'ИИ готов' : 'Ожидание'}
            </span>
          </div>

          {/* 2. Переключатель темы */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-1.5 sm:p-2 rounded-xl bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 dark:bg-neutral-800 dark:border-neutral-700 dark:text-amber-400 dark:hover:bg-neutral-700 transition-colors cursor-pointer flex items-center justify-center shadow-xs shrink-0"
            title={theme === 'dark' ? 'Перейти на светлую тему' : 'Перейти на тёмную тему'}
            aria-label={theme === 'dark' ? 'Перейти на светлую тему' : 'Перейти на тёмную тему'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 stroke-[2.2]" />
            ) : (
              <Moon className="w-4 h-4 stroke-[2.2]" />
            )}
          </button>

          {/* 3. Кнопка меню ☰ и выпадающее меню */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`p-1.5 sm:p-2 rounded-xl border transition-colors cursor-pointer flex items-center justify-center shadow-xs ${
                isMenuOpen
                  ? 'bg-amber-400 border-amber-400 text-neutral-950 font-bold dark:bg-amber-400 dark:border-amber-400 dark:text-neutral-950'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700'
              }`}
              title="Меню дополнительных функций"
              aria-label="Меню дополнительных функций"
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? (
                <X className="w-4 h-4 stroke-[2.5]" />
              ) : (
                <Menu className="w-4 h-4 stroke-[2.2]" />
              )}
            </button>

            {/* Dropdown Menu (supports light & dark themes seamlessly) */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl py-2 z-50 text-neutral-800 dark:text-neutral-100 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3.5 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                    Меню функций
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(false)}
                    className="text-neutral-400 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 p-0.5 rounded cursor-pointer"
                    aria-label="Закрыть меню"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2 space-y-1">
                  {/* Collapsible Section «Для разработчика» */}
                  <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/70 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsDevExpanded(!isDevExpanded)}
                      className="w-full px-3 py-2.5 flex items-center justify-between text-left text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                        <span>Для разработчика</span>
                      </div>
                      {isDevExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-300" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-300" />
                      )}
                    </button>

                    {isDevExpanded && (
                      <div className="px-3 pb-2.5 pt-1 border-t border-neutral-200/70 dark:border-neutral-700/80 space-y-2">
                        <button
                          type="button"
                          onClick={handleOpenCodeModal}
                          className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-200 hover:border-amber-400 hover:text-amber-600 dark:hover:border-amber-400 dark:hover:text-amber-400 transition-colors cursor-pointer group"
                        >
                          <span className="font-medium">Посмотреть HTML-код</span>
                          <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-500 dark:text-neutral-400">
                            Код игры
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* AI Model Info */}
                  <div className="px-3 py-2 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-400" />
                      <span>Модель ИИ</span>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-neutral-900 dark:text-neutral-100">
                      {serverStatus?.model || 'gemini-3.8-flash'}
                    </span>
                  </div>

                  {/* Offline guarantee info */}
                  <div className="px-3 py-2 text-[11px] text-neutral-700 dark:text-neutral-300 bg-amber-500/10 dark:bg-amber-400/10 rounded-lg border border-amber-500/20 dark:border-amber-400/20 leading-relaxed flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>Игры автономны на 100%: без CDN, без сети, без внешних скриптов.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Developer HTML Code Modal Dialog (Fully viewport-contained, responsive & scrollable) */}
      {isCodeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="code-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsCodeModalOpen(false);
            }
          }}
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88dvh] flex flex-col overflow-hidden my-auto">
            {/* Modal Header (Fixed / Non-collapsing) */}
            <div className="px-4 sm:px-6 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-neutral-50 dark:bg-neutral-900 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-400 shrink-0">
                  <Code2 className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h4 id="code-modal-title" className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white truncate">
                    Исходный HTML-код игры
                  </h4>
                  <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {currentGameTitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 cursor-pointer transition-colors"
                  title="Скопировать весь код в буфер"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{copied ? 'Скопировано!' : 'Скопировать код'}</span>
                  <span className="sm:hidden">{copied ? 'OK' : 'Копия'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCodeModalOpen(false)}
                  className="p-1.5 sm:p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors"
                  aria-label="Закрыть окно кода"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Code Body (Scrolls independently vertically and horizontally) */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-3 sm:p-5 bg-neutral-950 font-mono text-xs text-neutral-200 leading-relaxed select-all">
              <pre className="whitespace-pre min-w-full font-mono">
                <code>{currentHtml || '<!-- HTML код игры пока не создан -->'}</code>
              </pre>
            </div>

            {/* Modal Footer (Fixed / Non-collapsing) */}
            <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
              <span className="truncate">Автономный единый HTML5-файл (HTML + CSS + JavaScript)</span>
              <button
                type="button"
                onClick={() => setIsCodeModalOpen(false)}
                className="font-semibold text-neutral-800 dark:text-neutral-200 hover:text-amber-500 dark:hover:text-amber-400 cursor-pointer shrink-0"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
