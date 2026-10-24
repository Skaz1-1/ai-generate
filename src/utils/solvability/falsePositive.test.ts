import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyAndFixGame,
  detectWinCondition,
  detectRestartMechanism,
} from './gameVerifier.ts';
import { verifyMazeSolvability } from './mazeSolver.ts';
import { verifyPlatformerSolvability } from './platformerSolver.ts';
import type { MazeLevelData, PlatformerLevelData } from './types.ts';

// -------------------------------------------------------------
// Тесты на предотвращение ложных подтверждений (False Positives)
// -------------------------------------------------------------

test('Ложное подтверждение: Игра без условия победы не получает статус verified', () => {
  const gameHtmlWithoutWin = `<!DOCTYPE html>
  <html>
  <head><title>No Win Game</title></head>
  <body>
    <canvas id="c"></canvas>
    <button id="restartBtn">Заново</button>
    <script>
      const c = document.getElementById('c');
      document.getElementById('restartBtn').onclick = () => location.reload();
    </script>
  </body>
  </html>`;

  assert.equal(detectWinCondition(gameHtmlWithoutWin), false, 'detectWinCondition должен вернуть false');
  assert.equal(detectRestartMechanism(gameHtmlWithoutWin), true, 'Перезапуск присутствует');

  const { report } = verifyAndFixGame(gameHtmlWithoutWin);
  assert.equal(report.passed, false, 'passed не должен быть true для игры без условия победы');
  assert.equal(report.status, 'issue_detected', 'Статус должен быть issue_detected');
  assert.ok(
    report.errors.some((e) => e.includes('условия победы') || e.includes('побед')),
    'Должна присутствовать ошибка об отсутствии условия победы'
  );
});

test('Ложное подтверждение: Игра без механизма перезапуска не получает статус verified', () => {
  const gameHtmlWithoutRestart = `<!DOCTYPE html>
  <html>
  <head><title>No Restart Game</title></head>
  <body>
    <canvas id="c"></canvas>
    <div id="score">0</div>
    <script>
      let score = 0;
      function checkScore() {
        if (score >= 100) {
          alert('Победа! Вы выиграли!');
        }
      }
    </script>
  </body>
  </html>`;

  assert.equal(detectWinCondition(gameHtmlWithoutRestart), true, 'Условие победы обнаружено');
  assert.equal(detectRestartMechanism(gameHtmlWithoutRestart), false, 'Перезапуск отсутствует');

  const { report } = verifyAndFixGame(gameHtmlWithoutRestart);
  assert.equal(report.passed, false, 'passed не должен быть true для игры без перезапуска');
  assert.equal(report.status, 'issue_detected', 'Статус должен быть issue_detected');
  assert.ok(
    report.errors.some((e) => e.includes('перезапуск')),
    'Должна присутствовать ошибка об отсутствии механизма перезапуска'
  );
});

test('Ложное подтверждение: Игра без условия победы И без перезапуска получает статус issue_detected с двумя ошибками', () => {
  const emptyGame = `<!DOCTYPE html>
  <html>
  <head><title>Empty Canvas Loop</title></head>
  <body>
    <canvas id="c"></canvas>
    <script>
      const c = document.getElementById('c');
      const ctx = c.getContext('2d');
      function draw() {
        ctx.fillRect(0, 0, 10, 10);
        requestAnimationFrame(draw);
      }
      draw();
    </script>
  </body>
  </html>`;

  const { report } = verifyAndFixGame(emptyGame);
  assert.equal(report.passed, false);
  assert.equal(report.status, 'issue_detected');
  assert.equal(report.errors.length, 2);
});

test('Ложное подтверждение: Слово "window" не должно ложно распознаваться как условие победы "win"', () => {
  const codeWithWindow = `<!DOCTYPE html>
  <html>
  <head><title>Window Object Only</title></head>
  <body>
    <button id="restartBtn">Заново</button>
    <script>
      window.addEventListener('resize', () => {
        const w = window.innerWidth;
      });
      document.getElementById('restartBtn').onclick = () => location.reload();
    </script>
  </body>
  </html>`;

  assert.equal(
    detectWinCondition(codeWithWindow),
    false,
    'Наличие слова "window" не должно засчитываться как условие победы'
  );

  const { report } = verifyAndFixGame(codeWithWindow);
  assert.equal(report.passed, false);
  assert.equal(report.status, 'issue_detected');
});

test('Ложное подтверждение: Игра с неподтверждённым игровым процессом (нестандартный жанр) получает insufficient_data, а НЕ passed: true', () => {
  // Игра с кнопками победы и перезапуска, но БЕЗ распознанной сетки лабиринта или платформ
  const clickerGame = `<!DOCTYPE html>
  <html>
  <head><title>Clicker Game</title></head>
  <body>
    <div id="score">0</div>
    <button id="clickBtn">Жми!</button>
    <button id="restartBtn">Сыграть заново</button>
    <script>
      let score = 0;
      document.getElementById('clickBtn').onclick = () => {
        score++;
        if (score >= 50) {
          alert('Победа! Вы набрали 50 очков!');
        }
      };
      document.getElementById('restartBtn').onclick = () => {
        score = 0;
      };
    </script>
  </body>
  </html>`;

  const { report } = verifyAndFixGame(clickerGame);

  // Критическое требование: не объявлять проверенным только из-за слов win/restart
  assert.equal(
    report.passed,
    false,
    'passed должен быть false (недостаточно данных для автоматического подтверждения проходимости)'
  );
  assert.equal(report.status, 'insufficient_data', 'Статус должен быть insufficient_data');
  assert.equal(report.errors.length, 0, 'Ошибок в коде нет');
  assert.ok(report.warnings.length > 0, 'Должно быть информативное предупреждение о статусе проверки');
  assert.notEqual(report.details?.exitReachable, true, 'exitReachable не должен ложно объявляться true');
});

test('Ложное подтверждение: Лабиринт с заблокированным выходом не получает статус verified без исправления', () => {
  const impassableMaze: MazeLevelData = {
    genre: 'maze',
    grid: [
      [0, 1, 1],
      [1, 1, 1], // Полностью непроходимая стена
      [1, 1, 0],
    ],
    start: { x: 0, y: 0 },
    exit: { x: 2, y: 2 },
  };

  const report = verifyMazeSolvability(impassableMaze);
  assert.equal(report.passed, false, 'Непроходимый лабиринт не должен проходить проверку');
  assert.equal(report.status, 'issue_detected', 'Статус должен быть issue_detected');
  assert.ok(report.errors.length > 0, 'Должны присутствовать ошибки проходимости');
});

test('Ложное подтверждение: Платформер с недостижимой платформой не получает статус verified', () => {
  const impossiblePlatformer: PlatformerLevelData = {
    genre: 'platformer',
    physics: { gravity: 0.5, jumpForce: 10, speed: 4 }, // макс. высота прыжка = 100px
    start: { x: 50, y: 350 },
    platforms: [
      { x: 20, y: 400, w: 100, h: 20 },
      { x: 160, y: 150, w: 100, h: 20 }, // 250px выше! Прыжок 100px физически не достаёт
    ],
    exit: { x: 180, y: 130 },
  };

  const report = verifyPlatformerSolvability(impossiblePlatformer);
  assert.equal(report.passed, false, 'Физически невозможный прыжок не должен проходить проверку');
  assert.equal(report.status, 'issue_detected', 'Статус должен быть issue_detected');
  assert.ok(report.errors.length > 0, 'Должна присутствовать ошибка о недостижимости');
});

test('Ложное подтверждение: Collector-игра с недостижимым счётом (targetScore > totalItems) получает статус issue_detected', () => {
  const impossibleCollectorHtml = `<!DOCTYPE html>
  <html>
  <head><title>Impossible Collector</title></head>
  <body>
    <button id="restartBtn">Заново</button>
    <script>
      window.GAME_LEVEL_DATA = {
        genre: 'collector',
        targetScore: 100,
        totalItems: 10
      };
      document.getElementById('restartBtn').onclick = () => location.reload();
      if (score >= 100) alert('Победа');
    </script>
  </body>
  </html>`;

  const { report } = verifyAndFixGame(impossibleCollectorHtml);
  assert.equal(report.passed, false);
  assert.equal(report.status, 'issue_detected');
  assert.ok(
    report.errors.some((e) => e.includes('превышает количество доступных предметов')),
    'Должна быть ошибка о превышении целевого счёта над количеством предметов'
  );
});
