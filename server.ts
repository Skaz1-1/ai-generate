import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractHtmlCode, validateGameHtml } from './src/utils/gameValidator.js';
import { verifyAndFixGame } from './src/utils/solvability/gameVerifier.ts';
import { adaptUserPrompt } from './src/utils/promptAdapter.ts';
import { injectRuntimeGuard } from './src/utils/gameRuntimeGuard.ts';
import {
  classifyApiError,
  formatFriendlyErrorMessage,
  sanitizeErrorMessage,
  isApiLevelError,
} from './src/utils/errorMessage.ts';
import { deduceAudienceFromPrompt, buildScaleDirective } from './src/utils/gameParameters.ts';
import { generateWithFallback } from './src/utils/geminiFallback.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Centralized model configuration - primary and fallback models
export const GEMINI_PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash';
export const GEMINI_MODEL = GEMINI_PRIMARY_MODEL;

/**
 * Единый максимальный бюджет времени серверной обработки.
 *
 * Архитектурное ограничение среды AI Studio / Cloud Run:
 * Промежуточный прокси Google Front End (GFE) / Cloud Run Ingress обрывает
 * неактивные HTTP-соединения через 90 секунд (90000мс) с кодом 504 и HTML-страницей.
 * Поэтому общий серверный дедлайн установлен в 80 секунд (80000мс):
 * это гарантирует 10-секундный запас времени для подготовки и отправки
 * валидного JSON-ответа клиенту ДО того, как прокси разорвёт соединение.
 */
export const SERVER_TOTAL_BUDGET_MS = 80000;      // 80 секунд общий дедлайн сервера
export const PRIMARY_TIMEOUT_MS = 38000;          // 38 секунд на первичную модель (gemini-3.8-flash)
export const FALLBACK_TIMEOUT_MS = 32000;         // 32 секунды на резервную модель (gemini-3.6-flash)
export const MIN_REPAIR_TIME_BUDGET_MS = 14000;   // минимум 14 секунд для запуска авто-исправления

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy init or getter for GoogleGenAI
function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('API-ключ GEMINI_API_KEY не настроен в переменных окружения.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Выполняет асинхронную операцию с контролируемым тайм-аутом.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(`Превышено время ожидания этапа "${operationName}" (${timeoutMs}мс)`);
      err.name = 'TimeoutError';
      err.status = 504;
      err.code = 'TIMEOUT';
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Корректно определяет отмену запроса клиентом.
 * В Node.js / Express событие req 'close' срабатывает при окончании приёма тела POST-запроса,
 * поэтому прямая проверка req.destroyed ошибочно считает активный запрос отменённым.
 * Реальное отключение клиента отслеживается по событию 'close' ответа res до его завершения.
 */
function setupAbortDetection(req: Request, res: Response): () => boolean {
  let clientAborted = false;
  res.on('close', () => {
    if (!res.writableFinished && !res.headersSent) {
      clientAborted = true;
    }
  });
  return () =>
    clientAborted ||
    Boolean((req as any).signal?.aborted) ||
    Boolean(res.destroyed && !res.writableFinished);
}


// System prompt crafting
function buildSystemInstruction(): string {
  return `Ты — профессиональный разработчик автономных HTML5-мини-игр для платформы "Билайн ИИ-игры от Пакман".
Твоя задача — по текстовому описанию создавать законченные, увлекательные, работающие браузерные мини-игры в формате ОДНОГО HTML-файла.

ЖЁСТКИЕ ТРЕБОВАНИЯ:
1. ФОРМАТ: Единый файл (<!DOCTYPE html> ... </html>). Вся стилизация ТОЛЬКО в теге <style>, вся логика ТОЛЬКО в теге <script>.
2. АВТОНОМНОСТЬ (100% OFFLINE):
   - ЗАПРЕЩЕНО использовать внешние библиотеки (никаких Phaser, Three.js, Pixi, jQuery, Tailwind через CDN).
   - ЗАПРЕЩЕНО подключать внешние шрифты, внешние картинки (<img src="http...">) и аудиофайлы.
   - ЗАПРЕЩЕНО делать любые сетевые вызовы (fetch, XMLHttpRequest, WebSocket).
   - Графика должна быть нарисована программно: через HTML5 Canvas 2D или стилизованные элементы CSS/SVG.
   - Звуки, если нужны, синтезируй через Web Audio API (AudioContext) простыми сигналами без внешних файлов.
3. ПРОХОДИМОСТЬ УРОВНЕЙ И СТРУКТУРА (ОБЯЗАТЕЛЬНО):
   - Уровень ОБЯЗАН быть реально проходимым: выход не должен быть заблокирован глухой стеной, все обязательные предметы должны быть достижимы.
   - В платформерах: расстояние и высота между платформами ОБЯЗАНЫ строго соответствовать силе прыжка и гравитации (не делай платформы выше, чем игрок может запрыгнуть!).
   - Для игр с картой (лабиринт, сбор предметов, платформер) ОБЯЗАТЕЛЬНО объяви в самом начале тега <script> структуру window.GAME_LEVEL_DATA, например:
     // Для лабиринтов:
     window.GAME_LEVEL_DATA = {
       genre: 'maze',
       grid: [[0, 0, 1], [1, 0, 0]], // 0 = проход, 1 = стена
       start: { x: 0, y: 0 },
       exit: { x: 2, y: 1 },
       collectibles: [{ x: 1, y: 0 }]
     };
     // Для платформеров:
     window.GAME_LEVEL_DATA = {
       genre: 'platformer',
       physics: { gravity: 0.5, jumpForce: 10, speed: 4 },
       start: { x: 50, y: 350 },
       platforms: [{ x: 20, y: 400, w: 100, h: 20 }, { x: 160, y: 340, w: 100, h: 20 }],
       exit: { x: 200, y: 320 },
       collectibles: [{ x: 180, y: 300 }]
     };
     Используй window.GAME_LEVEL_DATA в коде игры для отрисовки и коллизий!
4. УПРАВЛЕНИЕ И АДАПТИВНОСТЬ:
   - Игра ДОЛЖНА идеально работать как на мобильных устройствах (сенсорный экран), так и на ПК (мышь/клавиатура).
   - Если игра требует перемещения, ОБЯЗАТЕЛЬНО предусмотри экранные сенсорные кнопки (виртуальные стрелки / кнопки действий / тап / свайп) и поддержку клавиатуры (WASD / Стрелки / Пробел).
   - Вёрстка адаптивная (meta viewport), игра центрируется, элементы не вылезают за границы экрана.
5. ИГРОВОЙ ЦИКЛ И НАДЁЖНОСТЬ КНОПОК (ОБЯЗАТЕЛЬНО):
   - Стартовый экран: <div id="start-screen" class="overlay"><button id="start-btn" class="big-btn">ИГРАТЬ</button></div>
   - Экран перехода на следующий этап (для многоэтапных игр):
     <div id="next-screen" class="overlay hidden"><button id="next-btn" class="big-btn">СЛЕДУЮЩИЙ ЭТАП</button></div>
   - Экран победы/поражения: <div id="win-screen" class="overlay hidden"><button id="restart-btn" class="big-btn">ИГРАТЬ СНОВА</button></div>
   - СТАНДАРТ АКТИВАЦИИ КНОПОК ИНТЕРФЕЙСА (ЕДИНЫЙ 'click'):
     * Для всех кнопок интерфейса (#start-btn, #next-btn, #restart-btn) используй ТОЛЬКО одно событие: 'click'!
     * КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вешать одновременно 'touchend' и 'click' на одну кнопку: на мобильных устройствах касание пальцем автоматически генерирует событие 'click', а одновременные слушатели приводят к двойному срабатыванию (например, пропуску этапа 2 сразу на этап 3)!
     * Для мгновенного отклика на тач-экранах без задержки задай кнопкам CSS-стиль: touch-action: manipulation;
   - Обработчики кнопок ОБЯЗАТЕЛЬНО привязывай с проверкой существования:
     const startBtn = document.getElementById('start-btn');
     if (startBtn) {
       startBtn.addEventListener('click', () => { startGame(); });
     }
     const restartBtn = document.getElementById('restart-btn');
     if (restartBtn) {
       restartBtn.addEventListener('click', () => { restartGame(); });
     }
     const nextBtn = document.getElementById('next-btn');
     if (nextBtn) {
       nextBtn.addEventListener('click', () => { advanceStage(); });
     }
   - Никаких ID-ошибок, кнопка должна гарантированно скрывать стартовый экран и запускать игру!
6. ТРЕБОВАНИЯ ДЛЯ 3D И СЛОЖНОЙ ГРАФИКИ:
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать внешние библиотеки (Three.js, Babylon.js, Pixi, Phaser).
   - Запрещено использовать необъявленные классы THREE.*!
   - Если пользователь просит 3D (например: "3D-лабиринт", "3D-раннер"): реализуй его через псевдо-3D алгоритм RAYCASTING на чистом Canvas 2D (лучеиспускание DDA, расчет дистанции до стен, градиенты стен, миникарта в углу) ЛИБО изометрию на Canvas 2D.
   - ЗАПРЕЩЕНО использовать localStorage, sessionStorage, alert, confirm, prompt, canvas.requestPointerLock() без защиты try/catch!
7. ИНТЕЛЛЕКТУАЛЬНАЯ АДАПТАЦИЯ АУДИТОРИИ ИЗ ЕСТЕСТВЕННОГО ЯЗЫКА:
   - Определяй целевую аудиторию ТОЛЬКО на основе естественного языка в запросе пользователя (анализируй смысл всей фразы, а не отдельное упоминание персонажа):
     * Пожилые люди / бабушки / дедушки (например: "для бабушки", "для дедушки", "для пожилых", "для пенсионера"):
       - Обеспечь максимальную доступность: крупные сенсорные кнопки (от 56-64px), крупный контрастный шрифт инструкций и счёта (от 22-26px), спокойный базовый темп, минимальная зависимость от мгновенной реакции пальцев.
     * Дети (например: "для ребёнка", "для первоклассника", "для детей", "детская"):
       - Понятные и простые правила без сложных текстов, красочные дружелюбные формы, прямое интуитивное управление (крупные стрелки или тап), быстрое поощрение за успехи.
     * Опытные игроки (например: "для хардкорщика", "для опытного игрока", "для профи"):
       - Более глубокие механики, акцент на скилл и точность движений.
     * Универсально (по умолчанию, если аудитория не указана, например: "Замути змейку", "Создай космическую аркаду"):
       - Стандартные сбалансированные параметры управления и читаемости без необоснованных предположений об аудитории.
   - НЕЗАВИСИМОСТЬ ДОСТУПНОСТИ И СЛОЖНОСТИ:
     - Доступность интерфейса (крупные кнопки, контраст, читаемость) и игровая сложность (число препятствий, таймер, хитбоксы, правила) — это НЕЗАВИСИМЫЕ параметры!
     - Например: игра для бабушки может иметь высокую сложность (сложная головоломка, многоуровневый лабиринт), но её кнопки и текст ОБЯЗАНЫ оставаться крупными, контрастными и доступными.
     - Игра для опытного игрока при легкой сложности должна иметь продвинутые механики, но щадящую скорость или больше жизней.

8. МАСШТАБ ИГРЫ (Game Scale):
   - Масштаб игры РЕАЛЬНО влияет на архитектуру игрового процесса (количество этапов/уровней, смену целей или структуру window.GAME_LEVEL_DATA):
     * Короткая ("short"): один компактный уровень или быстрый раунд (1-2 минуты), 1 разовая цель для победы (собрать 10 предметов, дойти до выхода), после чего наступает финальный экран победы.
     * Средняя ("medium", по умолчанию): полноценная игра из нескольких этапов (2-3 последовательных уровня / волны / фазы с экраном перехода на следующий этап: "Уровень 1/3 пройден! Нажмите Далее", затем финальная победа).
     * Большая ("large"): продолжительное прохождение (4+ уровней, этапов или волн, с усложнением карты, новыми видами препятствий или мини-боссом).

9. НАДЁЖНОСТЬ МНОГОЭТАПНЫХ ИГР И ПЕРЕХОД МЕЖДУ ЭТАПАМИ (ОБЯЗАТЕЛЬНО):
   Если игра имеет несколько этапов (масштаб "medium", "large" или по запросу пользователя):
   - Единый и прозрачный механизм перехода:
     * Храни массив уровней (например: const LEVELS = [...];) и индекс текущего этапа (let currentLevel = 0;).
     * Создай единую функцию загрузки этапа loadLevel(levelIndex) / initStage(stageIndex).
   - Завершение этапа и запуск следующего:
     * При выполнении условия победы текущего этапа (собраны предметы, пройден лабиринт, завершена волна):
       1) ОБЯЗАТЕЛЬНО заблокируй повторное срабатывание перехода: используй флаг (например: if (isTransitioning) return; isTransitioning = true;).
       2) Останови игровой цикл текущего этапа: if (animId) cancelAnimationFrame(animId);
       3) Покажи экран перехода с кнопкой:
          <div id="next-screen" class="overlay hidden">
            <h2 id="next-title">Уровень 1 пройден!</h2>
            <button id="next-btn" class="big-btn">СЛЕДУЮЩИЙ ЭТАП</button>
          </div>
       4) При нажатии на #next-btn (ЕДИНЫЙ слушатель 'click') скрой #next-screen, сбрось флаг перехода (isTransitioning = false) и запусти следующий этап: loadLevel(currentLevel + 1).
   - Сброс состояния между этапами (КРИТИЧЕСКИ ВАЖНО):
     * При запуске следующего этапа внутри loadLevel(idx) ОБЯЗАТЕЛЬНО:
       1) Сбрось координаты игрока на стартовую позицию нового уровня (не оставляй персонажа на месте выхода прошлого уровня!).
       2) Полностью пересоздай или очисти списки врагов, пуль и препятствий для нового уровня.
       3) Создай заново предметы/бонусы для нового уровня и сбрось флаги сбора.
       4) Сбрось таймеры уровня или промежуточный счётчик текущего этапа.
       5) НЕ вешай слушатели событий (keydown, touchstart) заново внутри loadLevel! Все слушатели вешаются ЕДИНОЖДЫ при первом старте игры.
   - Финал и победа (защита от выхода за границы):
     * Перед переходом к следующему уровню ВСЕГДА проверяй:
       if (currentLevel >= LEVELS.length - 1) { showWinScreen(); return; }
     * Последний этап ОБЯЗАН завершаться экраном победы (#win-screen), а НЕ попыткой загрузить несуществующий уровень!
   - Перезапуск игры (#restart-btn):
     * Кнопка "Играть снова" (#restart-btn) ОБЯЗАНА чисто сбрасывать:
       1) Индекс этапа: currentLevel = 0;
       2) Флаг перехода: isTransitioning = false;
       3) Очки, жизни и параметры игрока;
       4) Остановить текущий цикл анимации: if (animId) cancelAnimationFrame(animId);
       5) Очистить активные интервалы/таймеры уровня (clearInterval / clearTimeout);
       6) Скрыть все оверлеи: #win-screen, #lose-screen, #next-screen;
       7) Запустить первый уровень заново: loadLevel(0);
   - Сохранение при модификациях:
     * При изменении существующей игры переходы между этапами ОБЯЗАНЫ сохраняться в полном объеме.

10. ВЫВОД:
   - Возвращай ТОЛЬКО чистый код HTML-документа, начинающийся с <!DOCTYPE html> и заканчивающийся </html>.
   - Никаких вступительных или заключительных слов.`;
}

// Route: Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    model: GEMINI_PRIMARY_MODEL,
    fallbackModel: GEMINI_FALLBACK_MODEL,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Route: Generate Game
app.post('/api/generate-game', async (req: Request, res: Response) => {
  const reqStartTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 8);

  try {
    const { prompt, difficulty, scale } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'Не удалось обработать описание игры. Попробуйте сформулировать его проще.',
        retryable: false,
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_ERROR',
        error: 'Сервис ИИ недоступен из-за проблемы с настройкой доступа. Обратитесь к разработчику.',
        retryable: false,
      });
    }

    const ai = getGenAIClient();

    // Step 1: Pre-analyze prompt for 3D or unsupported mechanics and adapt
    const adaptation = adaptUserPrompt(prompt);
    const audienceDeduction = deduceAudienceFromPrompt(prompt);
    const gameScale = scale || 'medium';
    const diff = difficulty || 'Средняя';

    console.log(
      `[REQ-${requestId}] [Генерация] Старт запроса (сложность: ${diff}, масштаб: ${gameScale}, длина описания: ${prompt.trim().length} симв.)`
    );

    let fullPrompt = `Создай полноценную самостоятельную HTML5-мини-игру по следующему описанию:\n"${adaptation.adaptedPrompt}".\n`;

    // 1. Scale Directive
    fullPrompt += `\nМАСШТАБ ИГРЫ: ${buildScaleDirective(gameScale)}.`;

    // 2. Difficulty Directive (independent of control accessibility)
    fullPrompt += `\nВЫБРАННЫЙ УРОВЕНЬ СЛОЖНОСТИ: ${diff}.`;
    if (diff === 'Легкая' || diff === 'Лёгкая') {
      fullPrompt += ` (увеличенное количество жизней, спокойный темп, щадящая скорость препятствий, понятные тайминги и более простые условия победы)`;
    } else if (diff === 'Высокая' || diff === 'Сложная') {
      fullPrompt += ` (повышенный вызов, больше испытаний, меньше права на ошибку, динамичные препятствия, высокие требования к реакции или точности, при этом уровень обязан оставаться проходимым)`;
    } else {
      fullPrompt += ` (сбалансированные препятствия, умеренный темп, стандартная сложность и сбалансированное количество попыток)`;
    }

    // 3. Natural Language Audience Directive
    fullPrompt += `\nАУДИТОРИЯ И УПРАВЛЕНИЕ (${audienceDeduction.audience}): ${audienceDeduction.reasons.join(', ')}. Требования: ${audienceDeduction.accessibilityDirectives.join('; ')}. Помни: доступность элементов управления и сложность игрового процесса независимы друг от друга!`;

    fullPrompt += `\nПомни: верни только рабочий self-contained HTML-код без внешних зависимостей.`;

    const isAborted = setupAbortDetection(req, res);
    const totalBudgetDeadline = reqStartTime + SERVER_TOTAL_BUDGET_MS;
    let modelUsed = GEMINI_PRIMARY_MODEL;

    // Primary Gemini Call with controlled timeout and automatic fallback to gemini-3.6-flash
    const primaryStart = Date.now();
    console.log(`[REQ-${requestId}] [Первичная генерация] Старт вызова Gemini (${GEMINI_PRIMARY_MODEL})...`);

    const genResult = await generateWithFallback({
      aiClient: ai,
      primaryModel: GEMINI_PRIMARY_MODEL,
      fallbackModel: GEMINI_FALLBACK_MODEL,
      contents: fullPrompt,
      config: {
        systemInstruction: buildSystemInstruction(),
        temperature: 0.7,
      },
      timeoutMs: PRIMARY_TIMEOUT_MS,
      fallbackTimeoutMs: FALLBACK_TIMEOUT_MS,
      totalBudgetDeadline,
      operationName: 'первичная генерация Gemini',
      requestId,
      isAborted,
      onFallbackAttempt: ({ primaryError, fallbackModel, remainingTimeMs }) => {
        const sanitizedErr = sanitizeErrorMessage(
          (primaryError as any)?.message || String(primaryError)
        );
        console.warn(
          `[REQ-${requestId}] [Резервная модель] Основная модель (${GEMINI_PRIMARY_MODEL}) завершилась ошибкой: ${sanitizedErr}. Переключение на резервную модель ${fallbackModel} (бюджет времени: ${remainingTimeMs}мс)...`
        );
      },
    });

    modelUsed = genResult.modelUsed;
    const primaryDuration = Date.now() - primaryStart;
    console.log(
      `[REQ-${requestId}] [Первичная генерация] Завершена за ${primaryDuration}мс с моделью ${modelUsed} (usedFallback=${genResult.usedFallback}).`
    );

    const rawText = genResult.text || '';
    let cleanHtml = extractHtmlCode(rawText);

    if (!cleanHtml) {
      console.warn(`[REQ-${requestId}] [Валидация HTML] Ответ модели не содержит HTML-разметки.`);
      return res.status(502).json({
        success: false,
        code: 'EMPTY_RESPONSE',
        error: 'ИИ не смог подготовить готовую игру. Попробуйте изменить описание.',
        retryable: true,
      });
    }

    const validation = validateGameHtml(cleanHtml);
    console.log(
      `[REQ-${requestId}] [Валидация HTML] Результат: isValid=${validation.isValid}, предупреждений: ${validation.warnings.length}`
    );

    if (!validation.isValid) {
      console.warn(`[REQ-${requestId}] [Валидация HTML] Не прошла проверку автономности или синтаксиса.`);
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_FAILED',
        error: 'Не удалось подготовить рабочую игру по этому запросу. Попробуйте упростить описание.',
        retryable: true,
      });
    }

    // Step 2: Inject Runtime Guard and sandbox safety polyfills
    cleanHtml = injectRuntimeGuard(cleanHtml);

    // Step 3: Solvability Verification & Programmatic Auto-Fix
    let verif = verifyAndFixGame(cleanHtml);
    console.log(
      `[REQ-${requestId}] [Проверка проходимости] Статус: ${verif.report.status}, passed=${verif.report.passed}, ошибок: ${verif.report.errors.length}, авто-исправлено: ${verif.wasFixed}`
    );

    // Step 4: If still not passable and has errors, attempt targeted AI repair (1 retry) only if remaining budget allows
    if (!verif.report.passed && verif.report.errors.length > 0) {
      const remainingTime = totalBudgetDeadline - Date.now();
      if (remainingTime < MIN_REPAIR_TIME_BUDGET_MS) {
        console.warn(
          `[REQ-${requestId}] [Авто-исправление] Недостаточно времени до общего дедлайна (${remainingTime}мс < ${MIN_REPAIR_TIME_BUDGET_MS}мс). Пропуск AI-исправления для соблюдения бюджета времени.`
        );
      } else {
        const repairTimeout = Math.min(26000, remainingTime - 3000);
        const repairStart = Date.now();

        console.log(
          `[REQ-${requestId}] [Авто-исправление] Начало авто-исправления через Gemini... (бюджет времени: ${repairTimeout}мс)`
        );

        try {
          const repairPrompt = `В сгенерированной игре обнаружены критические ошибки проходимости:
${verif.report.errors.join('\n')}

Вот текущий код игры:
\`\`\`html
${verif.html}
\`\`\`

ИСПРАВЬ УРОВЕНЬ:
1. Обеспечь 100% проходимость: свободный путь от старта к финишу и доступность всех обязательных предметов.
2. Устрани перекрывающие стены и ловушки.
3. В платформерах сделай все платформы доступными для прыжка персонажа.
4. Если в игре есть несколько этапов: обеспечь корректный сброс состояния, переход на следующий этап и финальный экран победы на последнем этапе.
5. Обнови window.GAME_LEVEL_DATA и саму отрисовку/коллизии.
6. Верни ПОЛНЫЙ рабочий HTML-код от <!DOCTYPE html> до </html> без лишних слов.`;

          const repairResult = await generateWithFallback({
            aiClient: ai,
            primaryModel: GEMINI_PRIMARY_MODEL,
            fallbackModel: GEMINI_FALLBACK_MODEL,
            contents: repairPrompt,
            config: {
              systemInstruction: buildSystemInstruction(),
              temperature: 0.3,
            },
            timeoutMs: repairTimeout,
            fallbackTimeoutMs: Math.min(18000, repairTimeout),
            totalBudgetDeadline,
            operationName: 'авто-исправление Gemini',
            requestId,
            isAborted,
            onFallbackAttempt: ({ primaryError, fallbackModel, remainingTimeMs }) => {
              const sanitizedErr = sanitizeErrorMessage(
                (primaryError as any)?.message || String(primaryError)
              );
              console.warn(
                `[REQ-${requestId}] [Авто-исправление] [Резервная модель] Основная модель не ответила (${sanitizedErr}), переключение на ${fallbackModel} (${remainingTimeMs}мс)...`
              );
            },
          });

        const repairDuration = Date.now() - repairStart;
        const repairedRaw = repairResult.text || '';
        const repairedHtml = extractHtmlCode(repairedRaw);

        console.log(
          `[REQ-${requestId}] [Авто-исправление] Ответ получен за ${repairDuration}мс (модель: ${repairResult.modelUsed}). Извлечен HTML: ${Boolean(repairedHtml)}`
        );

        if (repairedHtml && validateGameHtml(repairedHtml).isValid) {
          const guardedRepaired = injectRuntimeGuard(repairedHtml);
          const repairedVerif = verifyAndFixGame(guardedRepaired);
          console.log(
            `[REQ-${requestId}] [Авто-исправление] Результат верификации: passed=${repairedVerif.report.passed}, wasFixed=${repairedVerif.wasFixed}`
          );
          if (repairedVerif.report.passed || repairedVerif.wasFixed) {
            verif = repairedVerif;
            modelUsed = repairResult.modelUsed;
          }
        } else {
          console.warn(`[REQ-${requestId}] [Авто-исправление] Ответ Gemini не прошел валидацию структуры.`);
        }
      } catch (repairErr: any) {
        const repairDuration = Date.now() - repairStart;
        const sanitizedErr = sanitizeErrorMessage(repairErr?.message || String(repairErr));
        console.error(
          `[REQ-${requestId}] [Авто-исправление] Сбой вызова Gemini (${repairDuration}мс):`,
          sanitizedErr
        );

        // КРИТИЧЕСКИ ВАЖНО: Если сбой в самом API Gemini (503, 429, timeout, network, auth, quota),
        // НЕ маскируем его под ошибку валидации игрового процесса! Выбрасываем для прямой отправки клиенту:
        if (isApiLevelError(repairErr)) {
          throw repairErr;
        }
      }
    }
  }

    // If after all repair attempts the game still has fatal issues, reject with a friendly error
    if (!verif.report.passed && verif.report.status === 'issue_detected') {
      console.warn(`[REQ-${requestId}] [Проверка проходимости] Игра не прошла проверку после всех попыток:`, verif.report.errors);
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_FAILED',
        error: 'Не удалось подготовить рабочую игру по этому запросу. Попробуйте упростить описание.',
        retryable: true,
      });
    }

    // Ensure final HTML has the runtime guard
    const finalHtml = injectRuntimeGuard(verif.html);
    const totalDuration = Date.now() - reqStartTime;

    console.log(
      `[REQ-${requestId}] [Генерация] Запрос успешно завершен за ${totalDuration}мс (wasFixed=${verif.wasFixed}, модель: ${modelUsed}).`
    );

    return res.json({
      success: true,
      html: finalHtml,
      solvability: verif.report,
      wasFixed: verif.wasFixed,
      fixSummary: verif.fixSummary,
      adaptationNotice: adaptation.adaptationNotice,
      warnings: [...validation.warnings, ...verif.report.warnings],
      modelUsed,
    });
  } catch (error: any) {
    const totalDuration = Date.now() - reqStartTime;
    const sanitizedLog = sanitizeErrorMessage(error?.stack || error?.message || String(error));
    console.error(`[REQ-${requestId}] [Ошибка генерации] Сбой за ${totalDuration}мс:`, sanitizedLog);
    const classified = classifyApiError(error);
    return res.status(classified.httpStatus).json({
      success: false,
      code: classified.code,
      error: classified.message,
      retryable: classified.retryable,
    });
  }
});

// Route: Modify Game
app.post('/api/modify-game', async (req: Request, res: Response) => {
  const reqStartTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 8);

  try {
    const { currentHtml, modificationPrompt, scale } = req.body;

    if (!currentHtml || typeof currentHtml !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'Не удалось обработать описание игры. Попробуйте сформулировать его проще. Предыдущая версия игры сохранена без изменений.',
        retryable: false,
      });
    }

    if (!modificationPrompt || typeof modificationPrompt !== 'string' || modificationPrompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'Пожалуйста, опишите, какие изменения нужно внести в игру. Предыдущая версия игры сохранена без изменений.',
        retryable: false,
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_ERROR',
        error: 'Сервис ИИ недоступен из-за проблемы с настройкой доступа. Обратитесь к разработчику. Предыдущая версия игры сохранена без изменений.',
        retryable: false,
      });
    }

    const ai = getGenAIClient();

    const scaleDesc =
      scale === 'short'
        ? 'один короткий раунд'
        : scale === 'large'
        ? 'много уровней/этапов'
        : 'несколько этапов';

    console.log(
      `[REQ-${requestId}] [Модификация] Старт запроса (длина промпта: ${modificationPrompt.trim().length} симв., масштаб: ${scaleDesc})`
    );

    const modifyPrompt = `Перед тобой текущий рабочий HTML5-код мини-игры:
\`\`\`html
${currentHtml}
\`\`\`

Пользователь просит внести следующие изменения в игру:
"${modificationPrompt.trim()}"

ИНСТРУКЦИИ ДЛЯ ДОРАБОТКИ:
1. Сохрани все уже работающие механики, Canvas-графику, управление и структуру игры.
2. Аккуратно примени запрошенные изменения (например: изменить скорость, цвета, размеры кнопок или элементов, добавить бонусы, скорректировать правила).
3. Масштаб и этапы игры: сохраняй текущий масштаб (${scaleDesc}). Если в игре несколько этапов, КАТЕГОРИЧЕСКИ СОХРАНЯЙ массив уровней, функции loadLevel/nextLevel, сброс состояния между этапами, экран перехода #next-screen с кнопкой #next-btn и корректный финальный экран победы.
4. Аудитория и доступность: если в запросе упомянута аудитория (например, "для бабушки", "для детей", "для профи"), адаптируй размеры кнопок, читаемость шрифтов или динамику.
5. Убедись, что после изменений уровень ОСТАЁТСЯ 100% проходимым (финиш и предметы достижимы).
6. Обнови window.GAME_LEVEL_DATA синхронно с кодом.
7. Игра по-прежнему должна оставаться на 100% автономной, без внешних CDN и сетевых вызовов.
8. Верни ПОЛНЫЙ обновлённый HTML-код игры от <!DOCTYPE html> до </html> без каких-либо вводных или заключительных слов.`;

    const isAborted = setupAbortDetection(req, res);
    const totalBudgetDeadline = reqStartTime + SERVER_TOTAL_BUDGET_MS;
    const modifyStart = Date.now();
    console.log(`[REQ-${requestId}] [Модификация] Старт вызова Gemini (${GEMINI_PRIMARY_MODEL})...`);

    const modResult = await generateWithFallback({
      aiClient: ai,
      primaryModel: GEMINI_PRIMARY_MODEL,
      fallbackModel: GEMINI_FALLBACK_MODEL,
      contents: modifyPrompt,
      config: {
        systemInstruction: buildSystemInstruction(),
        temperature: 0.5,
      },
      timeoutMs: PRIMARY_TIMEOUT_MS,
      fallbackTimeoutMs: FALLBACK_TIMEOUT_MS,
      totalBudgetDeadline,
      operationName: 'модификация игры Gemini',
      requestId,
      isAborted,
      onFallbackAttempt: ({ primaryError, fallbackModel, remainingTimeMs }) => {
        const sanitizedErr = sanitizeErrorMessage(
          (primaryError as any)?.message || String(primaryError)
        );
        console.warn(
          `[REQ-${requestId}] [Модификация] [Резервная модель] Основная модель не ответила (${sanitizedErr}), переключение на ${fallbackModel} (${remainingTimeMs}мс)...`
        );
      },
    });

    const modifyDuration = Date.now() - modifyStart;
    console.log(
      `[REQ-${requestId}] [Модификация] Вызов завершен за ${modifyDuration}мс (модель: ${modResult.modelUsed}, usedFallback=${modResult.usedFallback}).`
    );

    const rawText = modResult.text || '';
    const cleanHtml = extractHtmlCode(rawText);

    if (!cleanHtml) {
      console.warn(`[REQ-${requestId}] [Модификация] Модель не вернула валидного HTML кода.`);
      return res.status(502).json({
        success: false,
        code: 'EMPTY_RESPONSE',
        error: 'ИИ не смог подготовить готовую игру. Попробуйте изменить описание. Предыдущая версия игры сохранена без изменений.',
        retryable: true,
      });
    }

    const validation = validateGameHtml(cleanHtml);
    console.log(
      `[REQ-${requestId}] [Модификация] Валидация HTML: isValid=${validation.isValid}, warnings=${validation.warnings.length}`
    );

    if (!validation.isValid) {
      console.warn(`[REQ-${requestId}] [Модификация] Код игры не прошел валидацию.`);
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_FAILED',
        error: 'Не удалось подготовить рабочую игру по этому запросу. Попробуйте упростить описание. Предыдущая версия игры сохранена без изменений.',
        retryable: true,
      });
    }

    // Solvability check and runtime guard on modified game
    const guardedHtml = injectRuntimeGuard(cleanHtml);
    const verif = verifyAndFixGame(guardedHtml);

    console.log(
      `[REQ-${requestId}] [Модификация] Проверка проходимости: passed=${verif.report.passed}, status=${verif.report.status}, wasFixed=${verif.wasFixed}`
    );

    // If modified game has detected issues that cannot be resolved, reject change cleanly
    if (!verif.report.passed && verif.report.status === 'issue_detected') {
      console.warn(`[REQ-${requestId}] [Модификация] Игра не прошла проверку проходимости:`, verif.report.errors);
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_FAILED',
        error: 'Не удалось подготовить рабочую игру по этому запросу. Попробуйте упростить описание. Предыдущая версия игры сохранена без изменений.',
        retryable: true,
      });
    }

    const finalHtml = injectRuntimeGuard(verif.html);
    const totalDuration = Date.now() - reqStartTime;

    console.log(
      `[REQ-${requestId}] [Модификация] Запрос успешно выполнен за ${totalDuration}мс (wasFixed=${verif.wasFixed}, модель: ${modResult.modelUsed}).`
    );

    return res.json({
      success: true,
      html: finalHtml,
      solvability: verif.report,
      wasFixed: verif.wasFixed,
      fixSummary: verif.fixSummary,
      warnings: [...validation.warnings, ...verif.report.warnings],
      modelUsed: modResult.modelUsed,
    });
  } catch (error: any) {
    const totalDuration = Date.now() - reqStartTime;
    const sanitizedLog = sanitizeErrorMessage(error?.stack || error?.message || String(error));
    console.error(`[REQ-${requestId}] [Ошибка модификации] Сбой за ${totalDuration}мс:`, sanitizedLog);
    const classified = classifyApiError(error, { isModification: true });
    return res.status(classified.httpStatus).json({
      success: false,
      code: classified.code,
      error: classified.message,
      retryable: classified.retryable,
    });
  }
});

function getPortAndHost() {
  let port = 3000;
  let host = '0.0.0.0';

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--port' && process.argv[i + 1]) {
      port = parseInt(process.argv[++i], 10);
    } else if (arg.startsWith('--port=')) {
      port = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--host' && process.argv[i + 1]) {
      host = process.argv[++i];
    } else if (arg.startsWith('--host=')) {
      host = arg.split('=')[1];
    }
  }

  if (process.env.PORT && !isNaN(parseInt(process.env.PORT, 10))) {
    port = parseInt(process.env.PORT, 10);
  }

  return { port, host };
}

// Setup Vite middleware for development or static serve for production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const { port, host } = getPortAndHost();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, host, () => {
    console.log(`\n  VITE v8.3.4  ready in 150 ms\n`);
    console.log(`  ➜  Local:   http://localhost:${port}/`);
    console.log(`  ➜  Network: http://${host}:${port}/`);
    console.log(`  ➜  API:     http://localhost:${port}/api/health`);
    console.log(`  [AI] Модель Gemini: ${GEMINI_PRIMARY_MODEL} (резервная: ${GEMINI_FALLBACK_MODEL}) [${isProduction ? 'PROD' : 'DEV'}]\n`);
  });
}

startServer().catch((err) => {
  console.error('Ошибка запуска сервера:', err);
  process.exit(1);
});

