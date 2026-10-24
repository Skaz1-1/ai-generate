import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractHtmlCode, validateGameHtml } from './src/utils/gameValidator.js';
import { verifyAndFixGame } from './src/utils/solvability/gameVerifier.ts';
import { adaptUserPrompt } from './src/utils/promptAdapter.ts';
import { injectRuntimeGuard } from './src/utils/gameRuntimeGuard.ts';
import { formatFriendlyErrorMessage } from './src/utils/errorMessage.ts';
import { deduceAudienceFromPrompt, buildScaleDirective } from './src/utils/gameParameters.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Centralized model configuration - uses the cost-effective / free-tier model
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

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
   - Экран победы/поражения: <div id="win-screen" class="overlay hidden"><button id="restart-btn" class="big-btn">ИГРАТЬ СНОВА</button></div>
   - Обработчики кнопок ОБЯЗАТЕЛЬНО привязывай с проверкой существования:
     const startBtn = document.getElementById('start-btn');
     if (startBtn) {
       startBtn.addEventListener('click', () => { startGame(); });
       startBtn.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); });
     }
     const restartBtn = document.getElementById('restart-btn');
     if (restartBtn) {
       restartBtn.addEventListener('click', () => { startGame(); });
       restartBtn.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); });
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

9. ВЫВОД:
   - Возвращай ТОЛЬКО чистый код HTML-документа, начинающийся с <!DOCTYPE html> и заканчивающийся </html>.
   - Никаких вступительных или заключительных слов.`;
}

// Route: Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    model: GEMINI_MODEL,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Route: Generate Game
app.post('/api/generate-game', async (req: Request, res: Response) => {
  try {
    const { prompt, difficulty, scale } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Пожалуйста, введите текстовое описание игры.',
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Ключ GEMINI_API_KEY не найден на сервере. Пожалуйста, укажите его в настройках Secrets.',
      });
    }

    const ai = getGenAIClient();

    // Step 1: Pre-analyze prompt for 3D or unsupported mechanics and adapt
    const adaptation = adaptUserPrompt(prompt);
    const audienceDeduction = deduceAudienceFromPrompt(prompt);
    const gameScale = scale || 'medium';
    const diff = difficulty || 'Средняя';

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

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: fullPrompt,
      config: {
        systemInstruction: buildSystemInstruction(),
        temperature: 0.7,
      },
    });

    const rawText = response.text || '';
    let cleanHtml = extractHtmlCode(rawText);

    if (!cleanHtml) {
      return res.status(502).json({
        error: 'Модель вернула пустой результат или некорректный ответ. Попробуйте еще раз с чуть более подробным описанием.',
      });
    }

    const validation = validateGameHtml(cleanHtml);
    if (!validation.isValid) {
      return res.status(422).json({
        error: `Сгенерированный код не прошел проверку безопасности или автономности: ${validation.error}`,
        raw: cleanHtml.slice(0, 500),
      });
    }

    // Step 2: Inject Runtime Guard and sandbox safety polyfills
    cleanHtml = injectRuntimeGuard(cleanHtml);

    // Step 3: Solvability Verification & Programmatic Auto-Fix
    let verif = verifyAndFixGame(cleanHtml);

    // Step 4: If still not passable and has errors, attempt targeted AI repair (1 retry)
    if (!verif.report.passed && verif.report.errors.length > 0) {
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
4. Обнови window.GAME_LEVEL_DATA и саму отрисовку/коллизии.
5. Верни ПОЛНЫЙ рабочий HTML-код от <!DOCTYPE html> до </html> без лишних слов.`;

        const repairResponse = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: repairPrompt,
          config: {
            systemInstruction: buildSystemInstruction(),
            temperature: 0.3,
          },
        });

        const repairedHtml = extractHtmlCode(repairResponse.text || '');
        if (repairedHtml && validateGameHtml(repairedHtml).isValid) {
          const guardedRepaired = injectRuntimeGuard(repairedHtml);
          const repairedVerif = verifyAndFixGame(guardedRepaired);
          if (repairedVerif.report.passed || repairedVerif.wasFixed) {
            verif = repairedVerif;
          }
        }
      } catch (e) {
        console.warn('Попытка автоматического исправления через ИИ не удалась:', e);
      }
    }

    // If after all repair attempts the game still has fatal issues, reject with a friendly error
    if (!verif.report.passed && verif.report.status === 'issue_detected') {
      console.warn('Игра не прошла проверку проходимости после всех попыток:', verif.report.errors);
      return res.status(422).json({
        success: false,
        error: 'Не удалось создать игру. Попробуйте ещё раз.',
      });
    }

    // Ensure final HTML has the runtime guard
    const finalHtml = injectRuntimeGuard(verif.html);

    return res.json({
      success: true,
      html: finalHtml,
      solvability: verif.report,
      wasFixed: verif.wasFixed,
      fixSummary: verif.fixSummary,
      adaptationNotice: adaptation.adaptationNotice,
      warnings: [...validation.warnings, ...verif.report.warnings],
      modelUsed: GEMINI_MODEL,
    });
  } catch (error: any) {
    console.error('Ошибка при генерации игры (технический лог):', error);
    const friendlyMessage = formatFriendlyErrorMessage(error);
    return res.status(500).json({
      error: friendlyMessage,
    });
  }
});

// Route: Modify Game
app.post('/api/modify-game', async (req: Request, res: Response) => {
  try {
    const { currentHtml, modificationPrompt, scale } = req.body;

    if (!currentHtml || typeof currentHtml !== 'string') {
      return res.status(400).json({
        error: 'Отсутствует исходный код игры для модификации.',
      });
    }

    if (!modificationPrompt || typeof modificationPrompt !== 'string' || modificationPrompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Пожалуйста, опишите, какие изменения нужно внести в игру.',
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Ключ GEMINI_API_KEY не найден на сервере. Пожалуйста, укажите его в настройках Secrets.',
      });
    }

    const ai = getGenAIClient();

    const scaleDesc =
      scale === 'short'
        ? 'один короткий раунд'
        : scale === 'large'
        ? 'много уровней/этапов'
        : 'несколько этапов';

    const modifyPrompt = `Перед тобой текущий рабочий HTML5-код мини-игры:
\`\`\`html
${currentHtml}
\`\`\`

Пользователь просит внести следующие изменения в игру:
"${modificationPrompt.trim()}"

ИНСТРУКЦИИ ДЛЯ ДОРАБОТКИ:
1. Сохрани все уже работающие механики, Canvas-графику, управление и структуру игры.
2. Аккуратно примени запрошенные изменения (например: изменить скорость, цвета, размеры кнопок или элементов, добавить бонусы, скорректировать правила).
3. Масштаб игры: сохраняй текущий масштаб игры (${scaleDesc}), если пользователь явно не попросил добавить/сократить этапы.
4. Аудитория и доступность: если в запросе упомянута аудитория (например, "для бабушки", "для детей", "для профи"), адаптируй размеры кнопок, читаемость шрифтов или динамику.
5. Убедись, что после изменений уровень ОСТАЁТСЯ 100% проходимым (финиш и предметы достижимы).
6. Обнови window.GAME_LEVEL_DATA синхронно с кодом.
7. Игра по-прежнему должна оставаться на 100% автономной, без внешних CDN и сетевых вызовов.
8. Верни ПОЛНЫЙ обновлённый HTML-код игры от <!DOCTYPE html> до </html> без каких-либо вводных или заключительных слов.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: modifyPrompt,
      config: {
        systemInstruction: buildSystemInstruction(),
        temperature: 0.5,
      },
    });

    const rawText = response.text || '';
    const cleanHtml = extractHtmlCode(rawText);

    if (!cleanHtml) {
      return res.status(502).json({
        error: 'Модель не смогла вернуть обновленный HTML-код. Предыдущая версия игры сохранена без изменений.',
      });
    }

    const validation = validateGameHtml(cleanHtml);
    if (!validation.isValid) {
      return res.status(422).json({
        error: `Обновленный код не прошел валидацию (${validation.error}). Предыдущая рабочая версия сохранена.`,
      });
    }

    // Solvability check and runtime guard on modified game
    const guardedHtml = injectRuntimeGuard(cleanHtml);
    const verif = verifyAndFixGame(guardedHtml);

    // If modified game has detected issues that cannot be resolved, reject change cleanly
    if (!verif.report.passed && verif.report.status === 'issue_detected') {
      console.warn('Модифицированная игра не прошла проверку проходимости:', verif.report.errors);
      return res.status(422).json({
        success: false,
        error: 'Не удалось создать игру. Попробуйте ещё раз. Предыдущая версия игры сохранена без изменений.',
      });
    }

    const finalHtml = injectRuntimeGuard(verif.html);

    return res.json({
      success: true,
      html: finalHtml,
      solvability: verif.report,
      wasFixed: verif.wasFixed,
      fixSummary: verif.fixSummary,
      warnings: [...validation.warnings, ...verif.report.warnings],
      modelUsed: GEMINI_MODEL,
    });
  } catch (error: any) {
    console.error('Ошибка при модификации игры (технический лог):', error);
    const friendlyMessage = formatFriendlyErrorMessage(error);
    return res.status(500).json({
      error: `${friendlyMessage} Предыдущая версия игры сохранена без изменений.`,
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
    console.log(`  [AI] Модель Gemini: ${GEMINI_MODEL} [${isProduction ? 'PROD' : 'DEV'}]\n`);
  });
}

startServer().catch((err) => {
  console.error('Ошибка запуска сервера:', err);
  process.exit(1);
});

