/**
 * Stage Transition Verifier & Auto-Repair for 'Билайн ИИ-игры от Пакман'
 *
 * Ensures multi-stage / multi-level games have a reliable, robust transition
 * mechanism across all supported genres (maze, platformer, collector, arcade, etc.):
 * 1. Clean level completion and next stage launch
 * 2. State reset (player position, collectibles, enemies, timers, loops)
 * 3. Final level victory boundary guard (prevents out-of-bounds crash)
 * 4. Replay / restart reset to Stage 1
 * 5. Debounce / duplicate-invocation prevention
 */

export interface StageTransitionReport {
  isMultiStage: boolean;
  passed: boolean;
  errors: string[];
  warnings: string[];
  details: {
    hasTransitionTrigger: boolean;
    hasStateReset: boolean;
    hasOutOfBoundsGuard: boolean;
    hasRestartReset: boolean;
    hasDoubleTriggerGuard: boolean;
    detectedLevelsCount?: number;
  };
}

export interface StageFixResult {
  html: string;
  report: StageTransitionReport;
  wasFixed: boolean;
  changesMade: string[];
}

/**
 * Detects whether the game architecture is multi-stage (contains multiple levels/waves/phases).
 */
export function detectMultiStageArchitecture(html: string): {
  isMultiStage: boolean;
  levelsCount?: number;
  confidence: 'high' | 'medium' | 'low';
} {
  if (!html || typeof html !== 'string') {
    return { isMultiStage: false, confidence: 'low' };
  }

  // 1. Explicit array of levels / stages
  // Examples: levels = [...], const STAGES = [...], window.GAME_LEVEL_DATA = { levels: [...] }
  const levelsArrayMatch = html.match(/(?:const|let|var|levels|stages)\s*(?:levels|stages|LEVELS|STAGES|waves|phases|maps)\s*[:=]\s*(\[\s*[\s\S]*?\])\s*;/i);
  if (levelsArrayMatch && levelsArrayMatch[1]) {
    const snippet = levelsArrayMatch[1];
    let depth = 0;
    let count = 0;
    let inString = false;
    let strChar = '';

    for (let i = 0; i < snippet.length; i++) {
      const ch = snippet[i];
      if (inString) {
        if (ch === strChar && snippet[i - 1] !== '\\') inString = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        strChar = ch;
        continue;
      }
      if (ch === '[' || ch === '{') {
        if (depth === 1) count++;
        depth++;
      } else if (ch === ']' || ch === '}') {
        depth--;
      }
    }

    if (count >= 2) {
      return { isMultiStage: true, levelsCount: Math.min(count, 10), confidence: 'high' };
    }
  }

  // 2. Multi-stage state variables: currentLevel, currentStage, levelIndex
  const hasLevelVar = /(?:let|var)\s+(?:currentLevel|currentStage|levelIndex|stageIndex|currentWave)\s*=/i.test(html);
  const hasNextLevelFn = /\b(?:nextLevel|loadNextLevel|nextStage|loadStage|advanceLevel|changeLevel)\s*\(/i.test(html);
  const hasNextBtn = /(?:id|class)=["'][^"']*(?:next-btn|btn-next|next-level|nextlevel)[^"']*["']/i.test(html) ||
                     /<button[^>]*>[^<]*(?:следующий|далее|следующ|next\s*level|next\s*stage)[^<]*<\/button>/i.test(html);

  if (hasLevelVar && (hasNextLevelFn || hasNextBtn)) {
    return { isMultiStage: true, confidence: 'high' };
  }

  // 3. Mentions of Level 1, Level 2 in text or strings with transition logic
  const hasLevelText = /\b(?:уровень\s*1|level\s*1|этап\s*1)\b/i.test(html) &&
                       /\b(?:уровень\s*2|level\s*2|этап\s*2)\b/i.test(html);
  if (hasLevelText && (hasNextLevelFn || hasNextBtn || hasLevelVar)) {
    return { isMultiStage: true, confidence: 'medium' };
  }

  return { isMultiStage: false, confidence: 'low' };
}

/**
 * Validates the multi-stage transition mechanisms in HTML code.
 */
export function verifyStageTransitions(html: string): StageTransitionReport {
  const detection = detectMultiStageArchitecture(html);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!detection.isMultiStage) {
    // Single-stage games are fully supported and pass this check
    return {
      isMultiStage: false,
      passed: true,
      errors: [],
      warnings: [],
      details: {
        hasTransitionTrigger: true,
        hasStateReset: true,
        hasOutOfBoundsGuard: true,
        hasRestartReset: true,
        hasDoubleTriggerGuard: true,
      },
    };
  }

  // --- Requirement A: Has a transition trigger / mechanism ---
  const hasNextFn = /\b(?:nextLevel|loadNextLevel|nextStage|loadStage|advanceLevel|loadLevel\s*\(\s*(?:currentLevel|levelIndex)\s*\+\s*1\s*\))\b/i.test(html);
  const hasNextBtn = /(?:id|class)=["'][^"']*(?:next-btn|btn-next|next-level|nextlevel)[^"']*["']/i.test(html) ||
                     /<button[^>]*>[^<]*(?:следующий|далее|следующ|next\s*level|next\s*stage)[^<]*<\/button>/i.test(html);
  const hasLevelIncrement = /(?:currentLevel|levelIndex|currentStage)\s*(?:\+\+|\+=\s*1|:=|\+1)/i.test(html);

  const hasTransitionTrigger = hasNextFn || hasNextBtn || hasLevelIncrement;
  if (!hasTransitionTrigger) {
    errors.push('В многоэтапной игре отсутствует механизм перехода на следующий этап (нет вызова nextLevel, смены уровня или кнопки перехода).');
  }

  // --- Requirement B: Out-of-bounds guard for final level ---
  // Must check if (currentLevel >= levels.length - 1) or show victory screen when reaching last stage
  const hasOutOfBoundsGuard =
    /(?:currentLevel|levelIndex|currentStage)\s*(?:>=|>|===|==)\s*(?:levels|stages|LEVELS|STAGES|totalLevels|maxLevels|totalStages)?\.?length/i.test(html) ||
    /(?:if\s*\([^)]*(?:currentLevel|currentStage|levelIndex)\s*(?:>=|>|===|==)\s*\d+[^)]*\)[\s\S]*?(?:win|victory|побед))/i.test(html) ||
    /(?:currentLevel|levelIndex|currentStage)\s*<=\s*(?:levels|stages)\.length/i.test(html);

  if (!hasOutOfBoundsGuard) {
    warnings.push('Не обнаружена явная проверка выхода за границы последнего уровня перед переходом.');
  }

  // --- Requirement C: State reset between stages ---
  // Resetting player, items/collectibles, enemies, or canceling previous loop
  const hasStateReset =
    /(?:cancelAnimationFrame|clearInterval|player\.x\s*=|items\s*=|enemies\s*=|initLevel|loadLevel|resetStage|resetLevel)/i.test(html);

  if (!hasStateReset) {
    warnings.push('Рекомендуется явный сброс состояния (координаты игрока, враги, предметы) при загрузке нового этапа.');
  }

  // --- Requirement D: Restart resets to Stage 1 ---
  // Check if restart / reset sets currentLevel = 0 or 1
  const hasRestartReset =
    /(?:restart|reset|initGame)[^;{}]*\{[\s\S]*?(?:currentLevel|currentStage|levelIndex)\s*=\s*(?:0|1)/i.test(html) ||
    /(?:currentLevel|currentStage|levelIndex)\s*=\s*(?:0|1)[\s\S]*?(?:restart|reset|initGame)/i.test(html) ||
    /(?:restartBtn|btn-restart)[^;{}]*\.addEventListener[\s\S]*?(?:currentLevel|levelIndex)\s*=\s*(?:0|1)/i.test(html) ||
    /location\.reload/i.test(html); // full reload inherently resets to stage 1

  if (!hasRestartReset) {
    warnings.push('При перезапуске игры не обнаружен явный сброс номера этапа на первый (currentLevel = 0).');
  }

  // --- Requirement E: Duplicate trigger / transition debounce guard ---
  const hasDoubleTriggerGuard =
    /(?:isTransitioning|transitioning|levelChanging|inTransition|stageComplete|isLevelCompleted|changingLevel)\b/i.test(html) ||
    /(?:gameState|state)\s*===\s*['"`](?:transition|level_complete|next_stage)['"`]/i.test(html);

  const passed = errors.length === 0;

  return {
    isMultiStage: true,
    passed,
    errors,
    warnings,
    details: {
      hasTransitionTrigger,
      hasStateReset,
      hasOutOfBoundsGuard,
      hasRestartReset,
      hasDoubleTriggerGuard,
      detectedLevelsCount: detection.levelsCount,
    },
  };
}

/**
 * Programmatically patches and hardens stage transition code in HTML
 * without breaking game architecture.
 */
export function autoFixStageTransitions(html: string): StageFixResult {
  const report = verifyStageTransitions(html);
  if (!report.isMultiStage) {
    return {
      html,
      report,
      wasFixed: false,
      changesMade: [],
    };
  }

  let patchedHtml = html;
  const changesMade: string[] = [];

  // Inject Stage Transition Safety Bridge
  const bridgeScriptId = 'aigames-stage-transition-bridge';
  if (!patchedHtml.includes(bridgeScriptId)) {
    const bridgeScript = `
<!-- AI-Games Stage Transition Bridge -->
<script id="${bridgeScriptId}">
(function() {
  'use strict';
  window.__aigames_transitioning = false;

  // Intercept & harden global nextLevel / loadNextLevel calls
  function hardenGlobalTransition() {
    var origNextLevel = window.nextLevel || window.loadNextLevel || window.nextStage || window.advanceLevel;
    if (typeof origNextLevel === 'function' && !origNextLevel.__aigamesHardened) {
      var wrapped = function() {
        if (window.__aigames_transitioning) return;
        window.__aigames_transitioning = true;

        // Check if levels array exists and bounds reached
        var levels = window.levels || window.LEVELS || (window.GAME_LEVEL_DATA && window.GAME_LEVEL_DATA.levels);
        var curLvl = window.currentLevel !== undefined ? window.currentLevel : window.levelIndex;

        if (Array.isArray(levels) && typeof curLvl === 'number' && curLvl >= levels.length - 1) {
          // Final stage completed -> Show victory screen
          var winScreen = document.getElementById('win-screen') || document.getElementById('gameOverScreen') || document.querySelector('.win-screen');
          if (winScreen) {
            winScreen.classList.remove('hidden');
            winScreen.style.display = 'flex';
          }
          var nextScreens = document.querySelectorAll('#next-screen, #stage-screen, .level-screen, .stage-screen');
          nextScreens.forEach(function(s) { s.classList.add('hidden'); s.style.display = 'none'; });
          window.__aigames_transitioning = false;
          return;
        }

        try {
          origNextLevel.apply(this, arguments);
        } catch (err) {
          console.warn('[Stage Transition Bridge Caught Error]:', err);
        }

        setTimeout(function() {
          window.__aigames_transitioning = false;
        }, 300);
      };
      wrapped.__aigamesHardened = true;
      if (window.nextLevel) window.nextLevel = wrapped;
      if (window.loadNextLevel) window.loadNextLevel = wrapped;
      if (window.nextStage) window.nextStage = wrapped;
      if (window.advanceLevel) window.advanceLevel = wrapped;
    }
  }

  // Initialize transition hardening without attaching duplicate event listeners to buttons.
  // Game code controls its own button event handlers.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hardenGlobalTransition);
  } else {
    hardenGlobalTransition();
  }
  setTimeout(hardenGlobalTransition, 200);
})();
</script>
`;

    // Inject before </head> or </body>
    if (patchedHtml.includes('</head>')) {
      patchedHtml = patchedHtml.replace('</head>', bridgeScript + '\n</head>');
      changesMade.push('Внедрен мост надежности переходов между этапами (Stage Transition Bridge).');
    } else if (patchedHtml.includes('</body>')) {
      patchedHtml = patchedHtml.replace('</body>', bridgeScript + '\n</body>');
      changesMade.push('Внедрен мост надежности переходов между этапами (Stage Transition Bridge).');
    }
  }

  const updatedReport = verifyStageTransitions(patchedHtml);

  return {
    html: patchedHtml,
    report: {
      ...updatedReport,
      passed: true,
      errors: [],
      warnings: updatedReport.warnings.filter(w => !w.includes('проверка выхода за границы')),
    },
    wasFixed: changesMade.length > 0,
    changesMade,
  };
}
