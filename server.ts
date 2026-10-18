import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractHtmlCode, validateGameHtml } from './src/utils/gameValidator.js';

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
   - Звуки, если нужны, синтезируй через Web Audio API (AudioContext) простыми сигналами без внешних файлов, либо сделай игру с богатыми визуальными эффектами.
3. УПРАВЛЕНИЕ И АДАПТИВНОСТЬ:
   - Игра ДОЛЖНА идеально работать как на мобильных устройствах (сенсорный экран), так и на ПК (мышь/клавиатура).
   - Если игра требует перемещения, ОБЯЗАТЕЛЬНО предусмотри экранные сенсорные кнопки (виртуальные стрелки / кнопки действий / тап / свайп) и поддержку клавиатуры (WASD / Стрелки / Пробел).
   - Вёрстка адаптивная (meta viewport), игра центрируется, элементы не вылезают за границы экрана.
4. ИГРОВОЙ ЦИКЛ (ОБЯЗАТЕЛЬНО):
   - Стартовый экран с названием игры, понятными правилами и крупной кнопкой "Играть" / "Старт".
   - Активный игровой процесс с чётким HUD (счет, жизни/таймер, прогресс).
   - Экран окончания (Победа или Поражение) с финальным счетом.
   - Кнопка перезапуска ("Играть снова"), которая мгновенно сбрасывает состояние и начинает новую игру без перезагрузки страницы.
5. АУДИТОРИЯ:
   - Если в описании указаны дети: яркие цвета, дружелюбные формы, легкая сложность, поощрительные сообщения.
   - Если указаны пожилые люди: особо крупный шрифт (от 22px+), очень крупные кнопки (от 56px+), высокий контраст, спокойный темп, отсутствие мелких деталей.
   - Для обычной аудитории: динамичный и увлекательный геймплей.
6. ДИЗАЙН:
   - Стильное оформление, аккуратная типографика (системные шрифты: system-ui, sans-serif), фирменные акценты (желтый #FFBE00, черный, темно-серый, белый).
7. ВЫВОД:
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
    const { prompt, audience, difficulty } = req.body;

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

    let fullPrompt = `Создай полноценную самостоятельную HTML5-мини-игру по следующему описанию:\n"${prompt.trim()}".\n`;
    if (audience) {
      fullPrompt += `\nЦелевая аудитория: ${audience}.`;
    }
    if (difficulty) {
      fullPrompt += `\nЖелаемый уровень сложности: ${difficulty}.`;
    }
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
    const cleanHtml = extractHtmlCode(rawText);

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

    return res.json({
      success: true,
      html: cleanHtml,
      warnings: validation.warnings,
      modelUsed: GEMINI_MODEL,
    });
  } catch (error: any) {
    console.error('Ошибка при генерации игры:', error);
    const message = error?.message || 'Неизвестная ошибка на сервере при обращении к ИИ.';
    return res.status(500).json({
      error: `Не удалось сгенерировать игру: ${message}`,
    });
  }
});

// Route: Modify Game
app.post('/api/modify-game', async (req: Request, res: Response) => {
  try {
    const { currentHtml, modificationPrompt } = req.body;

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

    const modifyPrompt = `Перед тобой текущий рабочий HTML5-код мини-игры:
\`\`\`html
${currentHtml}
\`\`\`

Пользователь просит внести следующие изменения в игру:
"${modificationPrompt.trim()}"

ИНСТРУКЦИИ ДЛЯ ДОРАБОТКИ:
1. Сохрани все уже работающие механики, Canvas-графику, управление и структуру игры.
2. Аккуратно примени запрошенные изменения (например: изменить скорость, цвета, размеры кнопок или элементов, добавить бонусы, скорректировать правила).
3. Убедись, что игра по-прежнему остаётся на 100% автономной, без внешних CDN, без сетевых запросов и с поддержкой сенсорного и клавиатурного управления.
4. Верни ПОЛНЫЙ обновлённый HTML-код игры от <!DOCTYPE html> до </html> без каких-либо вводных или заключительных слов.`;

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

    return res.json({
      success: true,
      html: cleanHtml,
      warnings: validation.warnings,
      modelUsed: GEMINI_MODEL,
    });
  } catch (error: any) {
    console.error('Ошибка при модификации игры:', error);
    const message = error?.message || 'Ошибка на сервере при обновлении игры.';
    return res.status(500).json({
      error: `Не удалось изменить игру: ${message}. Предыдущая версия игры сохранена.`,
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

