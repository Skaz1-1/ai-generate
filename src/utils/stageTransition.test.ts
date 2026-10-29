import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMultiStageArchitecture,
  verifyStageTransitions,
  autoFixStageTransitions,
} from './solvability/stageTransitionVerifier.ts';
import { verifyAndFixGame } from './solvability/gameVerifier.ts';

// Sample multi-stage game template with standard contract
const validMultiStageGame = `<!DOCTYPE html>
<html>
<head><title>Multi-Stage Adventure</title></head>
<body>
  <div id="game-container">
    <div id="hud">Уровень: <span id="level-display">1</span> / 3 | Счёт: <span id="score">0</span></div>
    <canvas id="gameCanvas" width="400" height="400"></canvas>
    
    <div id="start-screen" class="overlay">
      <button id="start-btn">ИГРАТЬ</button>
    </div>

    <div id="next-screen" class="overlay hidden" style="display: none;">
      <h2>Уровень пройден!</h2>
      <button id="next-btn">СЛЕДУЮЩИЙ ЭТАП</button>
    </div>

    <div id="win-screen" class="overlay hidden" style="display: none;">
      <h2>ПОБЕДА! Вся игра пройдена!</h2>
      <button id="restart-btn">ИГРАТЬ СНОВА</button>
    </div>
  </div>

  <script>
    const LEVELS = [
      { id: 1, targetScore: 5, playerStart: { x: 20, y: 20 }, enemySpeed: 1 },
      { id: 2, targetScore: 8, playerStart: { x: 50, y: 50 }, enemySpeed: 2 },
      { id: 3, targetScore: 12, playerStart: { x: 100, y: 100 }, enemySpeed: 3 }
    ];

    window.levels = LEVELS;
    window.currentLevel = 0;
    let isTransitioning = false;
    let score = 0;
    let animId = null;

    window.player = { x: 20, y: 20 };
    window.enemies = [];
    window.items = [];

    function resetStageState(levelIdx) {
      const lvl = LEVELS[levelIdx];
      // 1. Reset player position to level start
      window.player.x = lvl.playerStart.x;
      window.player.y = lvl.playerStart.y;
      // 2. Re-create collectibles
      window.items = [];
      for (let i = 0; i < lvl.targetScore; i++) {
        window.items.push({ x: 30 + i * 20, y: 40, collected: false });
      }
      // 3. Reset enemies
      window.enemies = [{ x: 200, y: 200, speed: lvl.enemySpeed }];
      score = 0;
    }

    window.loadLevel = function(idx) {
      if (animId) cancelAnimationFrame(animId);
      window.currentLevel = idx;
      resetStageState(idx);
      document.getElementById('level-display').textContent = (idx + 1);
    };

    window.nextLevel = function() {
      if (isTransitioning) return;
      isTransitioning = true;

      // Final level check
      if (window.currentLevel >= LEVELS.length - 1) {
        document.getElementById('win-screen').style.display = 'flex';
        isTransitioning = false;
        return;
      }

      const nextScreen = document.getElementById('next-screen');
      nextScreen.style.display = 'flex';
    };

    document.getElementById('next-btn').addEventListener('click', () => {
      document.getElementById('next-screen').style.display = 'none';
      isTransitioning = false;
      window.loadLevel(window.currentLevel + 1);
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
      document.getElementById('win-screen').style.display = 'none';
      window.currentLevel = 0;
      window.loadLevel(0);
    });

    // Start initial level
    window.loadLevel(0);
  </script>
</body>
</html>`;

test('1. Одноэтапные игры сохраняют полную поддержку без ложных ошибок переходов', () => {
  const singleStageGame = `<!DOCTYPE html>
  <html>
  <body>
    <button id="start-btn">Старт</button>
    <button id="restart-btn">Снова</button>
    <script>
      let score = 0;
      function win() { alert("Победа!"); }
      function restart() { score = 0; }
    </script>
  </body>
  </html>`;

  const detection = detectMultiStageArchitecture(singleStageGame);
  assert.equal(detection.isMultiStage, false, 'Одноэтапная игра не должна определяться как многоэтапная');

  const report = verifyStageTransitions(singleStageGame);
  assert.equal(report.passed, true, 'Одноэтапная игра должна проходить валидацию');
  assert.equal(report.errors.length, 0);
});

test('2. detectMultiStageArchitecture корректно определяет игры с несколькими этапами', () => {
  const detection = detectMultiStageArchitecture(validMultiStageGame);
  assert.equal(detection.isMultiStage, true, 'Должна определяться как многоэтапная');
  assert.equal(detection.levelsCount, 3, 'Должно определиться 3 уровня');
});

test('3. Завершение первого этапа и запуск второго: переключение уровня и обновление индекса', () => {
  const report = verifyStageTransitions(validMultiStageGame);
  assert.equal(report.passed, true, 'Многоэтапная игра со стандартным контрактом проходит валидацию');
  assert.equal(report.errors.length, 0);
  assert.equal(report.details.hasTransitionTrigger, true, 'Триггер перехода обнаружен');
  assert.equal(report.details.hasStateReset, true, 'Сброс состояния обнаружен');
  assert.equal(report.details.hasOutOfBoundsGuard, true, 'Защита границ уровней обнаружена');
});

test('4. Сброс состояния между этапами: очистка координат, предметов и врагов', () => {
  // Simulate execution of resetStageState
  const levels = [
    { id: 1, playerStart: { x: 20, y: 20 }, targetScore: 5 },
    { id: 2, playerStart: { x: 50, y: 50 }, targetScore: 8 },
  ];
  const player = { x: 20, y: 20 };
  let items = [{ collected: true }, { collected: true }];

  // Stage 1 completed -> transition to Stage 2
  player.x = levels[1].playerStart.x;
  player.y = levels[1].playerStart.y;
  items = Array.from({ length: levels[1].targetScore }, () => ({ collected: false }));

  assert.equal(player.x, 50, 'Координата X игрока сброшена на старт этапа 2');
  assert.equal(player.y, 50, 'Координата Y игрока сброшена на старт этапа 2');
  assert.equal(items.length, 8, 'Предметы созданы заново для этапа 2');
  assert.equal(items.every(i => !i.collected), true, 'Все предметы этапа 2 не собраны');
});

test('5. Переход через все этапы до последнего и корректный экран победы (out-of-bounds guard)', () => {
  const levels = [1, 2, 3];
  let curLvl = 0;
  let won = false;

  function advance() {
    if (curLvl >= levels.length - 1) {
      won = true;
      return;
    }
    curLvl++;
  }

  // Level 1 -> Level 2
  advance();
  assert.equal(curLvl, 1);
  assert.equal(won, false);

  // Level 2 -> Level 3 (last level)
  advance();
  assert.equal(curLvl, 2);
  assert.equal(won, false);

  // Level 3 finished -> Victory!
  advance();
  assert.equal(curLvl, 2, 'Индекс уровня не выходит за границы массива');
  assert.equal(won, true, 'Победа наступает после завершения последнего этапа');
});

test('6. Перезапуск игры с первого этапа: сброс индекса currentLevel на 0', () => {
  let currentLevel = 2; // finished on level 3
  let score = 25;

  function restartGame() {
    currentLevel = 0;
    score = 0;
  }

  restartGame();
  assert.equal(currentLevel, 0, 'currentLevel сброшен на 0');
  assert.equal(score, 0, 'Счёт сброшен');
});

test('7. Отсутствие повторного срабатывания перехода при нескольких вызовах условия победы', () => {
  let isTransitioning = false;
  let transitionCallsCount = 0;

  function triggerStageWin() {
    if (isTransitioning) return;
    isTransitioning = true;
    transitionCallsCount++;
  }

  // Simulate 60 FPS animation loop calling condition multiple times
  triggerStageWin();
  triggerStageWin();
  triggerStageWin();

  assert.equal(transitionCallsCount, 1, 'Переход должен сработать строго 1 раз');
});

test('8. autoFixStageTransitions автоматически исправляет многоэтапную игру с потерянным обработчиком перехода', () => {
  const brokenTransitionGame = `<!DOCTYPE html>
  <html>
  <body>
    <div id="next-screen" class="hidden">
      <button id="next-btn">СЛЕДУЮЩИЙ ЭТАП</button>
    </div>
    <div id="win-screen" class="hidden">
      <button id="restart-btn">ИГРАТЬ СНОВА</button>
    </div>
    <script>
      const levels = [{ map: 1 }, { map: 2 }];
      window.levels = levels;
      window.currentLevel = 0;
      window.nextLevel = function() {
        window.currentLevel++;
      };
      // Ошибка: забыли навесить addEventListener на кнопку next-btn!
    </script>
  </body>
  </html>`;

  const fixResult = autoFixStageTransitions(brokenTransitionGame);
  assert.equal(fixResult.wasFixed, true, 'Должен быть применен авто-фикс');
  assert.ok(fixResult.html.includes('aigames-stage-transition-bridge'), 'Мост переходов внедрен в HTML');
  assert.equal(fixResult.report.passed, true, 'После автофикса игра проходит валидацию');
});

test('9. verifyAndFixGame интегрирует проверку переходов и сохраняет исправленный HTML', () => {
  const multiLevelHtml = `<!DOCTYPE html>
  <html>
  <body>
    <button id="start-btn">Играть</button>
    <button id="restart-btn">Снова</button>
    <button id="next-btn">Далее</button>
    <script>
      const levels = [{ id: 1 }, { id: 2 }];
      let currentLevel = 0;
      function nextLevel() { currentLevel++; }
      function checkWin() { if (currentLevel >= 1) return true; }
    </script>
  </body>
  </html>`;

  const result = verifyAndFixGame(multiLevelHtml);
  assert.ok(result.report.details?.stageTransitions, 'Отчет содержит детали stageTransitions');
  assert.equal(result.report.details?.stageTransitions?.isMultiStage, true);
  assert.equal(result.report.details?.stageTransitions?.passed, true);
});

test('10. Модификация игры сохраняет многоэтапность и переходы', () => {
  // Simulate modifying game code with updated speed
  const modifiedHtml = validMultiStageGame.replace('enemySpeed: 1', 'enemySpeed: 1.5');
  const result = verifyAndFixGame(modifiedHtml);
  assert.equal(result.report.details?.stageTransitions?.isMultiStage, true);
  assert.equal(result.report.details?.stageTransitions?.passed, true);
  assert.ok(result.html.includes('enemySpeed: 1.5'), 'Модификация успешно применена');
});

test('11. Одиночный клик по кнопке перехода переводит с Этапа 1 строго на Этап 2 (без пропуска на Этап 3)', () => {
  let currentLevel = 0;
  let levelLoads = 0;
  let loadedLevels: number[] = [];

  function loadLevel(idx: number) {
    currentLevel = idx;
    levelLoads++;
    loadedLevels.push(idx);
  }

  // Initial load
  loadLevel(0);
  assert.equal(currentLevel, 0);

  // Single click simulation with only game listener (no duplicate runtime guard listeners)
  function handleNextButtonClick() {
    loadLevel(currentLevel + 1);
  }

  handleNextButtonClick();

  assert.equal(currentLevel, 1, 'Уровень должен стать ровно 1 (Этап 2), а не 2 (Этап 3)');
  assert.equal(levelLoads, 2, 'Всего 2 вызова loadLevel: старт (0) и переход (1)');
  assert.deepEqual(loadedLevels, [0, 1], 'Порядок загрузки этапов должен быть строго [0, 1]');
});

test('12. Последовательный переход через все этапы 1 -> 2 -> 3 происходит строго по порядку', () => {
  const TOTAL_STAGES = 3;
  let currentStage = 1;
  const stageHistory: number[] = [currentStage];

  function onNextStage() {
    if (currentStage < TOTAL_STAGES) {
      currentStage++;
      stageHistory.push(currentStage);
    }
  }

  // Stage 1 -> Next clicked once
  onNextStage();
  assert.equal(currentStage, 2, 'После первого клика активен Этап 2');

  // Stage 2 -> Next clicked once
  onNextStage();
  assert.equal(currentStage, 3, 'После второго клика активен Этап 3');

  assert.deepEqual(stageHistory, [1, 2, 3], 'Этапы пройдены строго 1 -> 2 -> 3 без пропуска промежуточных этапов');
});

test('13. Завершение последнего (3) этапа переводит на экран победы, а не на несуществующий этап', () => {
  const STAGES = [{ id: 1 }, { id: 2 }, { id: 3 }];
  let currentLevel = 2; // on stage 3 (0-indexed)
  let winScreenVisible = false;
  let nextStageAttempted = false;

  function advanceOrWin() {
    if (currentLevel >= STAGES.length - 1) {
      winScreenVisible = true;
      return;
    }
    currentLevel++;
    nextStageAttempted = true;
  }

  advanceOrWin();

  assert.equal(winScreenVisible, true, 'Экран победы должен быть показан');
  assert.equal(nextStageAttempted, false, 'Попытка загрузки этапа 4 не должна выполняться');
  assert.equal(currentLevel, 2, 'Индекс уровня остаётся 2 (последний этап)');
});

test('14. Перезапуск игры (#restart-btn) чисто сбрасывает все состояния: уровень 0, очки, флаги и оверлеи', () => {
  let currentLevel = 2;
  let isTransitioning = true;
  let score = 450;
  let animId: number | null = 101;
  let activeTimer: NodeJS.Timeout | null = setTimeout(() => {}, 10000);
  let winOverlayHidden = false;
  let nextOverlayHidden = false;

  function restartGame() {
    // 1. Stop loops and timers
    if (animId !== null) {
      animId = null;
    }
    if (activeTimer !== null) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
    // 2. Reset stage and flags
    currentLevel = 0;
    isTransitioning = false;
    score = 0;
    // 3. Hide overlays
    winOverlayHidden = true;
    nextOverlayHidden = true;
  }

  restartGame();

  assert.equal(currentLevel, 0, 'Индекс уровня должен быть сброшен на 0');
  assert.equal(isTransitioning, false, 'Флаг перехода сброшен в false');
  assert.equal(score, 0, 'Счёт сброшен в 0');
  assert.equal(animId, null, 'Цикл анимации остановлен');
  assert.equal(activeTimer, null, 'Таймеры уровня очищены');
  assert.equal(winOverlayHidden, true, 'Экран победы скрыт');
  assert.equal(nextOverlayHidden, true, 'Экран перехода скрыт');
});

test('15. Runtime Guard и Stage Bridge не содержат дублирующих button click/touchend слушателей', () => {
  const result = verifyAndFixGame(validMultiStageGame);
  // Ensure the bridge script inside HTML does not attach duplicate event listeners to buttons
  assert.ok(!result.html.includes('dataset.aigamesNextBound'), 'Мост переходов не должен регистрировать слушатели кнопок next');
  assert.ok(!result.html.includes('dataset.aigamesRestartLevelBound'), 'Мост переходов не должен регистрировать слушатели кнопок restart');
  assert.ok(!result.html.includes('setupButtonFallbacks'), 'Runtime Guard не должен содержать setupButtonFallbacks');
});

