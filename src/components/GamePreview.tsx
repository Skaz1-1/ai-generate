import React, { useState } from 'react';
import {
  Download,
  RotateCcw,
  Maximize2,
  Minimize2,
  Code2,
  Play,
  Copy,
  Check,
  Edit3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { GameVersion } from '../types.ts';

interface GamePreviewProps {
  currentVersion: GameVersion;
  history: GameVersion[];
  currentVersionIndex: number;
  onSelectVersion: (index: number) => void;
  onDownload: () => void;
  onModifyClick: () => void;
  isLoading: boolean;
}

export const GamePreview: React.FC<GamePreviewProps> = ({
  currentVersion,
  history,
  currentVersionIndex,
  onSelectVersion,
  onDownload,
  onModifyClick,
  isLoading,
}) => {
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleRestart = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentVersion.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  return (
    <div
      className={`bg-white border border-neutral-200/90 rounded-2xl overflow-hidden transition-all flex flex-col shadow-sm ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none bg-neutral-950 p-3'
          : 'relative'
      }`}
    >
      {/* Top Toolbar: Only the most essential visible actions */}
      <div className="bg-neutral-50/80 px-4 sm:px-5 py-3 border-b border-neutral-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Version indicator and history */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-neutral-900">
            Версия {currentVersion.version}
          </span>

          {/* Compact version picker if multiple versions exist */}
          {history.length > 1 && (
            <div className="flex items-center gap-1 ml-2">
              {history.map((ver, idx) => (
                <button
                  key={ver.id}
                  type="button"
                  onClick={() => onSelectVersion(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    currentVersionIndex === idx
                      ? 'bg-neutral-900 text-white'
                      : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  Версия {ver.version}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Visible Actions: «Играть», «Изменить игру», «Скачать игру» */}
        <div className="flex items-center gap-2">
          {/* «Играть» / Перезапуск */}
          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            title="Запустить игру сначала"
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-600" />
            <span>Играть заново</span>
          </button>

          {/* «Изменить игру» */}
          <button
            type="button"
            onClick={onModifyClick}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            title="Перейти к изменению игры"
          >
            <Edit3 className="w-3.5 h-3.5 text-neutral-600" />
            <span>Изменить игру</span>
          </button>

          {/* «Скачать игру» (Hero CTA button) */}
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
            title="Скачать готовую игру на устройство"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Скачать игру</span>
          </button>

          {/* Fullscreen icon */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 transition-colors cursor-pointer"
            title={isFullscreen ? 'Свернуть' : 'Во весь экран'}
            aria-label={isFullscreen ? 'Свернуть' : 'Во весь экран'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Game Screen (Hero Element) */}
      <div className="bg-neutral-950 flex items-center justify-center p-2 sm:p-3">
        <iframe
          key={iframeKey}
          srcDoc={currentVersion.html}
          title={`Игра - Версия ${currentVersion.version}`}
          sandbox="allow-scripts"
          className="w-full h-[520px] sm:h-[580px] border-0 bg-black block rounded-xl"
        />
      </div>

      {/* Collapsible «Дополнительно» (HTML source code) */}
      <div className="border-t border-neutral-200/80 bg-neutral-50/60 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-neutral-500 hover:text-neutral-800 font-medium flex items-center gap-1 py-1 cursor-pointer transition-colors"
          >
            <Code2 className="w-3.5 h-3.5 text-neutral-400" />
            <span>Дополнительно: Исходный HTML-код</span>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAdvanced && (
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 px-2.5 py-1 rounded-lg cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Скопировано' : 'Скопировать код'}</span>
            </button>
          )}
        </div>

        {showAdvanced && (
          <div className="mt-3 bg-neutral-950 rounded-xl p-3 font-mono text-xs text-neutral-300 max-h-64 overflow-auto select-all leading-relaxed">
            <pre>
              <code>{currentVersion.html}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
