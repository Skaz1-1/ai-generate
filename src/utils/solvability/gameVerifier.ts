import type { SolvabilityReport } from './types.ts';
import { verifyMazeSolvability, autoFixMaze } from './mazeSolver.ts';
import { verifyPlatformerSolvability, autoFixPlatformer } from './platformerSolver.ts';
import { extractLevelDataFromHtml, replaceLevelDataInHtml } from './levelExtractor.ts';

export interface VerifyAndFixResult {
  html: string;
  report: SolvabilityReport;
  wasFixed: boolean;
  fixSummary: string[];
}

/**
 * Master entry point: verifies level solvability and automatically fixes errors
 * before presenting the game to the user.
 */
export function verifyAndFixGame(html: string): VerifyAndFixResult {
  const extracted = extractLevelDataFromHtml(html);
  const fixSummary: string[] = [];

  // 1. Maze / Grid Genre
  if (extracted.genre === 'maze' && extracted.mazeData) {
    let report = verifyMazeSolvability(extracted.mazeData);

    if (!report.passed) {
      // Auto-repair maze level
      const { fixedData, changesMade } = autoFixMaze(extracted.mazeData);
      const recheck = verifyMazeSolvability(fixedData);

      if (recheck.passed) {
        const updatedHtml = replaceLevelDataInHtml(html, fixedData);
        return {
          html: updatedHtml,
          report: {
            ...recheck,
            warnings: [
              ...recheck.warnings,
              `Уровень лабиринта автоматически скорректирован для гарантированной проходимости (${changesMade.length} испр.).`,
            ],
          },
          wasFixed: true,
          fixSummary: changesMade,
        };
      } else {
        // Partial fix
        const updatedHtml = replaceLevelDataInHtml(html, fixedData);
        return {
          html: updatedHtml,
          report: recheck,
          wasFixed: changesMade.length > 0,
          fixSummary: changesMade,
        };
      }
    }

    return {
      html,
      report,
      wasFixed: false,
      fixSummary: [],
    };
  }

  // 2. Platformer Genre
  if (extracted.genre === 'platformer' && extracted.platformerData) {
    let report = verifyPlatformerSolvability(extracted.platformerData);

    if (!report.passed) {
      // Auto-repair platformer level
      const { fixedData, changesMade } = autoFixPlatformer(extracted.platformerData);
      const recheck = verifyPlatformerSolvability(fixedData);

      if (recheck.passed) {
        const updatedHtml = replaceLevelDataInHtml(html, fixedData);
        return {
          html: updatedHtml,
          report: {
            ...recheck,
            warnings: [
              ...recheck.warnings,
              `Платформы и физика прыжков автоматически скорректированы (${changesMade.length} испр.).`,
            ],
          },
          wasFixed: true,
          fixSummary: changesMade,
        };
      } else {
        const updatedHtml = replaceLevelDataInHtml(html, fixedData);
        return {
          html: updatedHtml,
          report: recheck,
          wasFixed: changesMade.length > 0,
          fixSummary: changesMade,
        };
      }
    }

    return {
      html,
      report,
      wasFixed: false,
      fixSummary: [],
    };
  }

  // 3. Collector Genre (Structured Honeycomb / Pellet / Item collection)
  if (extracted.genre === 'collector' && extracted.collectorData) {
    const data = extracted.collectorData;
    const errors: string[] = [];
    const warnings: string[] = [];

    const total = data.totalItems ?? (data.collectibles ? data.collectibles.length : 0);
    const target = data.targetScore ?? total;

    if (total <= 0) {
      errors.push('На уровне отсутствуют предметы для сбора.');
    } else if (target > total) {
      errors.push(
        `Целевой счёт для победы (${target}) превышает количество доступных предметов (${total}) на уровне.`
      );
    }

    const passed = errors.length === 0;
    return {
      html,
      report: {
        passed,
        status: passed ? 'verified' : 'issue_detected',
        genre: 'collector',
        errors,
        warnings,
        details: {
          collectiblesTotal: total,
          collectiblesReachable: passed ? total : 0,
          exitReachable: passed,
        },
      },
      wasFixed: false,
      fixSummary: [],
    };
  }

  // 4. Other genres / unstructured games (Clickers, Reaction, Arcade, Custom Canvas)
  // Check whether essential game loop mechanisms exist in code.
  const hasWinCheck = detectWinCondition(html);
  const hasRestart = detectRestartMechanism(html);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasWinCheck) {
    errors.push('В игре не обнаружено проверки условия победы (отсутствует цель, условие победы или завершение игры).');
  }
  if (!hasRestart) {
    errors.push('В игре не обнаружено механизма перезапуска (отсутствует кнопка или функция для повторной игры).');
  }

  // Distinguish:
  // 1. Issue detected (missing win condition or restart handler)
  if (errors.length > 0) {
    return {
      html,
      report: {
        passed: false,
        status: 'issue_detected',
        genre: 'other',
        errors,
        warnings,
        details: {},
      },
      wasFixed: false,
      fixSummary: [],
    };
  }

  // 2. Insufficient data: basic keywords found, but level has no spatial geometry to verify solvability.
  // We do NOT falsely declare passed: true.
  return {
    html,
    report: {
      passed: false, // Not certified solvable
      status: 'insufficient_data',
      genre: 'other',
      errors: [],
      warnings: [
        'Недостаточно структурированных данных уровня для автоматической проверки проходимости (нестандартный жанр/механика).',
      ],
      details: {},
    },
    wasFixed: false,
    fixSummary: [],
  };
}

/**
 * Detects whether HTML code contains a legitimate victory / win condition.
 * Avoids false positives from unrelated words like 'window' or 'darwin'.
 */
export function detectWinCondition(html: string): boolean {
  if (!html || typeof html !== 'string') return false;

  const patterns = [
    // Russian victory keywords with word boundaries
    /\b(побед[аыуе]|победил[аи]?|выиграл[аи]?|ты\s*победил|победа!)\b/i,
    // Explicit win state or victory identifiers (does NOT match 'window')
    /\b(you\s*win|winner|victory|victoryScreen|gameWon|levelComplete|level_complete|game_win|winGame|playerWins|checkWin|isWin)\b/i,
    // State assignments
    /(?:state|status|scene|gameState|game_state)\s*=\s*['"`](?:win|won|victory)['"`]/i,
    // Score comparisons towards a goal
    /(?:score|points|coins|honeycombs|stars|items|count)\s*(?:>=|>|===|==)\s*(?:\d+|target|max|goal|targetScore|WIN_SCORE)/i,
    /(?:targetScore|winScore|goalScore)\s*[:=]\s*\d+/i,
    // Win UI screens or modals
    /(?:show|display|open)(?:Win|Victory)Screen/i,
    /<[^>]+id=["'][^"']*(?:win|victory)[^"']*["']/i,
    /\b(congratulations|поздравляем|отличная работа)\b/i,
  ];

  return patterns.some((p) => p.test(html));
}

/**
 * Detects whether HTML code contains a legitimate restart / replay mechanism.
 */
export function detectRestartMechanism(html: string): boolean {
  if (!html || typeof html !== 'string') return false;

  const patterns = [
    // Function declarations or calls
    /\b(restart|reset|restartGame|resetGame|initGame|playAgain|startOver|retry)\s*\(/i,
    // Event listeners attached to restart/reset/retry
    /(?:restart|reset|retry|again)[_a-zA-Z0-9]*\.(?:addEventListener|onclick)/i,
    /(?:addEventListener|onclick)\s*=\s*.*?(?:restart|reset|retry|again|init)/i,
    // HTML buttons with restart semantics in ID, class or text
    /<button[^>]*id=["'][^"']*(?:restart|reset|retry|again)[^"']*["']/i,
    /<button[^>]*class=["'][^"']*(?:restart|reset|retry|again)[^"']*["']/i,
    /<button[^>]*>(?:[\s\S]*?(?:заново|снова|рестарт|перезапуск|play\s*again|restart|retry)[\s\S]*?)<\/button>/i,
    // Russian text references in scripts
    /\b(начать\s*заново|сыграть\s*снова|кнопка\s*рестарта|перезапуск\s*игры)\b/i,
    // Reload
    /\blocation\.reload\s*\(/i,
    // Key listeners handling 'r' or 'R' or Space for restart
    /(?:key|code)\s*===?\s*['"`](?:KeyR|r|R)['"`]/i,
  ];

  return patterns.some((p) => p.test(html));
}
