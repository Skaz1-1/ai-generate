import React from 'react';
import { Gamepad2 } from 'lucide-react';

interface HeaderProps {
  serverStatus?: {
    model: string;
    hasApiKey: boolean;
  } | null;
}

export const Header: React.FC<HeaderProps> = ({ serverStatus }) => {
  return (
    <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
        {/* Simple Brand identity */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center font-bold shadow-sm shrink-0">
            <Gamepad2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-base font-bold text-neutral-900 tracking-tight flex items-center gap-1.5">
              <span>Билайн</span>
              <span className="text-amber-500 font-extrabold">ИИ-игры</span>
              <span className="text-neutral-400 font-normal text-xs sm:text-sm">от Пакман</span>
            </div>
          </div>
        </div>

        {/* Minimal AI status */}
        <div className="flex items-center gap-2 text-xs">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 border border-neutral-200/80 text-neutral-600">
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus?.hasApiKey ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-[11px] font-medium text-neutral-700">
              {serverStatus?.hasApiKey ? 'ИИ готов' : 'Ожидание ключа'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
