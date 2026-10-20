import React from 'react';
import { Gamepad2, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  serverStatus?: {
    model: string;
    hasApiKey: boolean;
  } | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({ serverStatus, theme, onToggleTheme }) => {
  return (
    <header className="border-b border-neutral-200/80 bg-white/90 dark:bg-neutral-900/90 dark:border-neutral-800 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
        {/* Simple Brand identity */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center font-bold shadow-sm shrink-0">
            <Gamepad2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-base font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-1.5">
              <span>Билайн</span>
              <span className="text-amber-500 dark:text-amber-400 font-extrabold">ИИ-игры</span>
              <span className="text-neutral-400 font-normal text-xs sm:text-sm">от Пакман</span>
            </div>
          </div>
        </div>

        {/* Top Right Controls: Theme Toggle & AI Status */}
        <div className="flex items-center gap-2 text-xs">
          {/* Compact Theme Toggle Button */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-xl bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 dark:bg-neutral-800 dark:border-neutral-700 dark:text-amber-400 dark:hover:bg-neutral-700 transition-colors cursor-pointer flex items-center justify-center shadow-xs"
            title={theme === 'dark' ? 'Перейти на светлую тему' : 'Перейти на тёмную тему'}
            aria-label={theme === 'dark' ? 'Перейти на светлую тему' : 'Перейти на тёмную тему'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 stroke-[2.2]" />
            ) : (
              <Moon className="w-4 h-4 stroke-[2.2]" />
            )}
          </button>

          {/* Minimal AI status */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 border border-neutral-200/80 text-neutral-600 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300">
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus?.hasApiKey ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
              {serverStatus?.hasApiKey ? 'ИИ готов' : 'Ожидание ключа'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
