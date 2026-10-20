import test from 'node:test';
import assert from 'node:assert';
import { validateGameHtml, extractHtmlCode } from './gameValidator.ts';
import { adaptUserPrompt } from './promptAdapter.ts';
import { verifyAndFixGame } from './solvability/gameVerifier.ts';
import { injectRuntimeGuard } from './gameRuntimeGuard.ts';
import { STARTER_GAME_HTML } from './starterGame.ts';

/**
 * Stage 5 Acceptance Tests:
 * 1) Обычный проходимый 2D-лабиринт — игра запускается, управление работает.
 * 2) Лабиринт с непроходимой стеной — ошибка обнаруживается и исправляется.
 * 3) Запрос на 3D-лабиринт — создаётся корректный адаптированный вариант либо показывается понятное сообщение, но приложение не зависает и не выдаёт неработающую игру как готовую.
 * 4) Игра с ошибкой JavaScript или неработающей кнопкой — ошибка обнаруживается / изолируется до того, как игра объявляется проверенной.
 * 5) Изменение уже созданной игры — после изменения запуск и основные функции продолжают работать.
 * 6) Скачивание HTML — скачанная игра по-прежнему работает автономно, если это предусмотрено архитектурой.
 */

test('Сценарий 1: Обычный проходимый 2D-лабиринт корректно валидируется и проходит верификацию', () => {
  const mazeHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>2D Лабиринт</title></head>
<body>
  <div id="start-screen"><button id="start-btn">ИГРАТЬ</button></div>
  <canvas id="game"></canvas>
  <div id="touch-controls"><button id="btn-up">▲</button></div>
  <script>
    window.GAME_LEVEL_DATA = {
      genre: 'maze',
      grid: [
        [0, 0, 0],
        [1, 1, 0],
        [0, 0, 0]
      ],
      start: { x: 0, y: 0 },
      exit: { x: 2, y: 2 },
      collectibles: [{ x: 2, y: 0 }]
    };
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => { document.getElementById('start-screen').style.display = 'none'; });
    }
  </script>
</body>
</html>`;

  // Валидация автономности
  const validation = validateGameHtml(mazeHtml);
  assert.strictEqual(validation.isValid, true, 'Игра должна быть валидной и автономной');

  // Верификация проходимости
  const verif = verifyAndFixGame(mazeHtml);
  assert.strictEqual(verif.report.passed, true, 'Свободный лабиринт должен пройти проверку BFS');
  assert.strictEqual(verif.report.genre, 'maze');
  assert.strictEqual(verif.wasFixed, false, 'Исправление не требуется для проходимого лабиринта');
});

test('Сценарий 2: Лабиринт с непроходимой стеной — ошибка обнаруживается и автоматически исправляется', () => {
  const blockedMazeHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <script>
    window.GAME_LEVEL_DATA = {
      genre: 'maze',
      grid: [
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 0]
      ],
      start: { x: 0, y: 0 },
      exit: { x: 2, y: 2 },
      collectibles: []
    };
  </script>
</body>
</html>`;

  const verif = verifyAndFixGame(blockedMazeHtml);
  // Автоматический корректор прорубает проход через непроходимую стену
  assert.strictEqual(verif.wasFixed, true, 'Непроходимый лабиринт должен быть исправлен');
  assert.strictEqual(verif.report.passed, true, 'После исправления уровень обязан быть проходимым');
  assert.ok(verif.fixSummary && verif.fixSummary.length > 0, 'Должен быть отчет об исправлении');
  assert.match(verif.html, /window\.GAME_LEVEL_DATA/);
});

test('Сценарий 3: Запрос на 3D-лабиринт адаптируется в надежный псевдо-3D (Raycasting на Canvas 2D) без сбоев', () => {
  const userRequest = 'Создай 3D-лабиринт с поиском сокровищ и видом от первого лица';
  const adaptation = adaptUserPrompt(userRequest);

  assert.strictEqual(adaptation.wasAdapted, true, 'Запрос на 3D должен быть распознан и адаптирован');
  assert.ok(adaptation.adaptationNotice, 'Пользователю должно отображаться понятное уведомление об адаптации');
  assert.match(adaptation.adaptedPrompt, /Raycasting|псевдо-3D|Canvas 2D/i, 'Промпт должен направлять ИИ на надёжный чистый Canvas 2D');

  // Проверка отклонения Three.js внешних библиотек
  const invalidThreeJsGame = `<!DOCTYPE html>
<html>
<head><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script></head>
<body><script>const scene = new THREE.Scene();</script></body>
</html>`;
  const validation = validateGameHtml(invalidThreeJsGame);
  assert.strictEqual(validation.isValid, false, 'Внешний Three.js CDN должен быть строго отклонен');
});

test('Сценарий 4: Игра с вызовами песочницы (localStorage, requestPointerLock) защищается Runtime Guard', () => {
  const riskyGameHtml = `<!DOCTYPE html>
<html>
<head><title>Тест песочницы</title></head>
<body>
  <div id="start-screen"><button id="start-btn">Играть</button></div>
  <script>
    // Потенциально аварийные вызовы в iframe sandbox="allow-scripts":
    localStorage.setItem('score', '100');
    sessionStorage.getItem('last_user');
    document.body.requestPointerLock();
  </script>
</body>
</html>`;

  const safeHtml = injectRuntimeGuard(riskyGameHtml);

  // Runtime guard должен быть внедрен
  assert.match(safeHtml, /aigames-guard-script/);
  assert.match(safeHtml, /createMemoryStorage/);
  assert.match(safeHtml, /requestPointerLock/);
  assert.match(safeHtml, /aigames-error-boundary/);
});

test('Сценарий 5: Модификация игры сохраняет проходимость и автономность', () => {
  const baseHtml = STARTER_GAME_HTML;
  assert.strictEqual(validateGameHtml(baseHtml).isValid, true);

  // Симуляция модификации (добавление дополнительных элементов)
  const modifiedHtml = baseHtml.replace(
    '<body>',
    '<body><!-- Версия 2: Увеличенная скорость и новые цвета -->'
  );

  const guarded = injectRuntimeGuard(modifiedHtml);
  const verif = verifyAndFixGame(guarded);

  assert.strictEqual(verif.report.passed, true, 'Модифицированная игра должна сохранять проходимость');
  assert.match(guarded, /<!DOCTYPE html>/i);
  assert.match(guarded, /<\/html>/i);
});

test('Сценарий 6: Скачиваемый HTML полностью автономен (100% Offline, no external CDN)', () => {
  const sampleGame = STARTER_GAME_HTML;
  const guardedHtml = injectRuntimeGuard(sampleGame);

  // 1. Нет внешних скриптов <script src="http...">
  assert.doesNotMatch(guardedHtml, /<script[^>]+src=["']http/i, 'Не должно быть внешних скриптов');
  // 2. Нет внешних стилей <link rel="stylesheet" href="http...">
  assert.doesNotMatch(guardedHtml, /<link[^>]+href=["']http/i, 'Не должно быть внешних css файлов');
  // 3. Нет внешних шрифтов Google Fonts
  assert.doesNotMatch(guardedHtml, /fonts\.googleapis\.com/i, 'Не должно быть внешних Google Fonts');
  // 4. Нет внешних изображений <img src="http...">
  assert.doesNotMatch(guardedHtml, /<img[^>]+src=["']http/i, 'Не должно быть внешних картинок');
  // 5. Содержит все необходимые компоненты для автономного запуска
  assert.match(guardedHtml, /<canvas/i, 'Должен быть локальный Canvas');
  assert.match(guardedHtml, /<script/i, 'Должен быть встроенный скрипт');
  assert.match(guardedHtml, /<style/i, 'Должны быть встроенные стили');
});
