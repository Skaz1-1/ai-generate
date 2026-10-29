import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateWithFallback,
  isEligibleForFallback,
  MIN_FALLBACK_TIME_BUDGET_MS,
} from './geminiFallback.js';

test('isEligibleForFallback: корректно определяет ошибки 503, 504 и сбои сети', () => {
  // 503 UNAVAILABLE / Overload
  assert.equal(isEligibleForFallback({ status: 503, message: 'The model is currently experiencing high demand.' }), true);
  assert.equal(isEligibleForFallback(new Error('503 Service Unavailable')), true);
  assert.equal(isEligibleForFallback(new Error('Model is overloaded. Please try again.')), true);

  // 504 TIMEOUT
  assert.equal(isEligibleForFallback({ status: 504, message: 'Gateway Timeout' }), true);
  const timeoutErr = new Error('Превышено время ожидания этапа "генерация" (100000мс)');
  (timeoutErr as any).name = 'TimeoutError';
  (timeoutErr as any).status = 504;
  assert.equal(isEligibleForFallback(timeoutErr), true);

  // Сетевые ошибки (TypeError: fetch failed, ECONNRESET, etc.)
  assert.equal(isEligibleForFallback(new TypeError('fetch failed')), true);
  assert.equal(isEligibleForFallback({ message: 'read ECONNRESET' }), true);
  assert.equal(isEligibleForFallback(new Error('NetworkError when attempting to fetch resource')), true);

  // Запрещенные к fallback ошибки
  // 429 Rate limit и Quota exhausted
  assert.equal(isEligibleForFallback({ status: 429, message: 'Rate limit exceeded' }), false);
  assert.equal(isEligibleForFallback({ status: 429, message: 'Resource has been exhausted (e.g. check quota)' }), false);
  assert.equal(isEligibleForFallback(new Error('RESOURCE_EXHAUSTED: quota exceeded')), false);

  // 401 / 403 Auth
  assert.equal(isEligibleForFallback({ status: 401, message: 'API key not valid' }), false);
  assert.equal(isEligibleForFallback({ status: 403, message: 'Permission denied' }), false);

  // 400 Invalid argument
  assert.equal(isEligibleForFallback({ status: 400, message: 'Invalid argument provided' }), false);

  // 422 Validation
  assert.equal(isEligibleForFallback({ status: 422, message: 'Validation failed' }), false);

  // Отмена клиентом
  assert.equal(isEligibleForFallback({ status: 503, message: '503 Unavailable' }, true), false);
});

test('generateWithFallback: успешный вызов основной модели не вызывает резервную', async () => {
  const calls: string[] = [];
  const fakeAi = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        return { text: '<!DOCTYPE html><html><body><h1>Game</h1></body></html>' };
      },
    },
  };

  const result = await generateWithFallback({
    aiClient: fakeAi,
    primaryModel: 'gemini-3.8-flash',
    fallbackModel: 'gemini-3.6-flash',
    contents: 'Создай игру',
    config: { temperature: 0.7 },
    timeoutMs: 5000,
    operationName: 'первичная генерация',
  });

  assert.equal(result.usedFallback, false);
  assert.equal(result.modelUsed, 'gemini-3.8-flash');
  assert.match(result.text, /Game/);
  assert.deepEqual(calls, ['gemini-3.8-flash']);
});

test('generateWithFallback: при ошибке 503 основной модели вызывается резервная ровно 1 раз', async () => {
  const calls: string[] = [];
  let fallbackNotification: any = null;

  const fakeAi = {
    models: {
      generateContent: async ({ model, config }: { model: string; config?: any }) => {
        calls.push(model);
        if (model === 'gemini-3.8-flash') {
          const err: any = new Error('The model is currently experiencing high demand. Please try again later.');
          err.status = 503;
          throw err;
        }
        assert.equal(config?.temperature, 0.7);
        return { text: '<!DOCTYPE html><html><body><h1>Fallback Game</h1></body></html>' };
      },
    },
  };

  const result = await generateWithFallback({
    aiClient: fakeAi,
    primaryModel: 'gemini-3.8-flash',
    fallbackModel: 'gemini-3.6-flash',
    contents: 'Создай игру',
    config: { temperature: 0.7 },
    timeoutMs: 5000,
    operationName: 'первичная генерация',
    onFallbackAttempt: (info) => {
      fallbackNotification = info;
    },
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.modelUsed, 'gemini-3.6-flash');
  assert.match(result.text, /Fallback Game/);
  assert.deepEqual(calls, ['gemini-3.8-flash', 'gemini-3.6-flash']);
  assert.ok(fallbackNotification);
  assert.equal(fallbackNotification.fallbackModel, 'gemini-3.6-flash');
});

test('generateWithFallback: при сбое сети (fetch failed) вызывается резервная модель', async () => {
  const calls: string[] = [];

  const fakeAi = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        if (model === 'gemini-3.8-flash') {
          throw new TypeError('fetch failed');
        }
        return { text: '<html>OK</html>' };
      },
    },
  };

  const result = await generateWithFallback({
    aiClient: fakeAi,
    primaryModel: 'gemini-3.8-flash',
    fallbackModel: 'gemini-3.6-flash',
    contents: 'Создай змейку',
    timeoutMs: 5000,
    operationName: 'первичная генерация',
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.modelUsed, 'gemini-3.6-flash');
  assert.deepEqual(calls, ['gemini-3.8-flash', 'gemini-3.6-flash']);
});

test('generateWithFallback: при ошибке 429 (лимит/квота) резервная модель НЕ вызывается', async () => {
  const calls: string[] = [];

  const fakeAi = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        const err: any = new Error('Resource has been exhausted (e.g. check quota).');
        err.status = 429;
        throw err;
      },
    },
  };

  await assert.rejects(
    async () => {
      await generateWithFallback({
        aiClient: fakeAi,
        primaryModel: 'gemini-3.8-flash',
        fallbackModel: 'gemini-3.6-flash',
        contents: 'Создай игру',
        timeoutMs: 5000,
        operationName: 'первичная генерация',
      });
    },
    (err: any) => {
      assert.equal(err.status, 429);
      return true;
    }
  );

  assert.deepEqual(calls, ['gemini-3.8-flash']);
});

test('generateWithFallback: при ошибке 401/403/400 резервная модель НЕ вызывается', async () => {
  const errors = [
    { status: 401, message: 'Invalid API key' },
    { status: 403, message: 'Permission denied' },
    { status: 400, message: 'Bad Request: invalid_argument' },
  ];

  for (const errorSample of errors) {
    const calls: string[] = [];
    const fakeAi = {
      models: {
        generateContent: async ({ model }: { model: string }) => {
          calls.push(model);
          const err: any = new Error(errorSample.message);
          err.status = errorSample.status;
          throw err;
        },
      },
    };

    await assert.rejects(
      async () => {
        await generateWithFallback({
          aiClient: fakeAi,
          primaryModel: 'gemini-3.8-flash',
          fallbackModel: 'gemini-3.6-flash',
          contents: 'Создай игру',
          timeoutMs: 5000,
          operationName: 'тест ошибки',
        });
      },
      (err: any) => err.status === errorSample.status
    );

    assert.deepEqual(calls, ['gemini-3.8-flash']);
  }
});

test('generateWithFallback: если клиент отменил запрос, резервная модель НЕ вызывается', async () => {
  const calls: string[] = [];

  const fakeAi = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        const err: any = new Error('503 Service Unavailable');
        err.status = 503;
        throw err;
      },
    },
  };

  await assert.rejects(
    async () => {
      await generateWithFallback({
        aiClient: fakeAi,
        primaryModel: 'gemini-3.8-flash',
        fallbackModel: 'gemini-3.6-flash',
        contents: 'Создай игру',
        timeoutMs: 5000,
        operationName: 'отмененный запрос',
        isAborted: () => true,
      });
    }
  );

  assert.equal(calls.length, 0); // отмена обнаружена перед стартом
});

test('generateWithFallback: если резервная модель тоже возвращает ошибку, она выбрасывается без повторных вызовов', async () => {
  const calls: string[] = [];

  const fakeAi = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        if (model === 'gemini-3.8-flash') {
          const err: any = new Error('503 Primary failed');
          err.status = 503;
          throw err;
        }
        const err2: any = new Error('503 Fallback also overloaded');
        err2.status = 503;
        throw err2;
      },
    },
  };

  await assert.rejects(
    async () => {
      await generateWithFallback({
        aiClient: fakeAi,
        primaryModel: 'gemini-3.8-flash',
        fallbackModel: 'gemini-3.6-flash',
        contents: 'Создай игру',
        timeoutMs: 5000,
        operationName: 'двойной сбой',
      });
    },
    (err: any) => {
      assert.match(err.message, /Fallback also overloaded/);
      return true;
    }
  );

  // Строго 2 вызова: 1 primary + 1 fallback, никакого зацикливания!
  assert.deepEqual(calls, ['gemini-3.8-flash', 'gemini-3.6-flash']);
});

test('generateWithFallback: при дефиците оставшегося времени (< 10 сек) резервная модель не запускается', async () => {
  const calls: string[] = [];

  const fakeAi = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        const err: any = new Error('503 Primary overloaded');
        err.status = 503;
        throw err;
      },
    },
  };

  // Дедлайн через 5 секунд (меньше MIN_FALLBACK_TIME_BUDGET_MS = 10000)
  const tightDeadline = Date.now() + 5000;

  await assert.rejects(
    async () => {
      await generateWithFallback({
        aiClient: fakeAi,
        primaryModel: 'gemini-3.8-flash',
        fallbackModel: 'gemini-3.6-flash',
        contents: 'Создай игру',
        timeoutMs: 5000,
        totalBudgetDeadline: tightDeadline,
        operationName: 'тайм-аут бюджет',
      });
    },
    (err: any) => {
      assert.match(err.message, /Primary overloaded/);
      return true;
    }
  );

  // Резервная модель не была запущена из-за нехватки времени
  assert.deepEqual(calls, ['gemini-3.8-flash']);
});

test('generateWithFallback: при исчерпанном дедлайне в самом начале (<= 4 сек) вызов сразу прерывается с TimeoutError', async () => {
  const calls: string[] = [];

  const fakeAi = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        return { text: '<html>OK</html>' };
      },
    },
  };

  const exhaustedDeadline = Date.now() + 2000; // Всего 2с до дедлайна

  await assert.rejects(
    async () => {
      await generateWithFallback({
        aiClient: fakeAi,
        primaryModel: 'gemini-3.8-flash',
        fallbackModel: 'gemini-3.6-flash',
        contents: 'Создай игру',
        timeoutMs: 38000,
        totalBudgetDeadline: exhaustedDeadline,
        operationName: 'тест исчерпанного бюджета',
      });
    },
    (err: any) => {
      assert.equal(err.name, 'TimeoutError');
      assert.equal(err.status, 504);
      assert.match(err.message, /Превышено общее время/);
      return true;
    }
  );

  assert.equal(calls.length, 0, 'Модель не должна вызываться, если времени до дедлайна не осталось');
});

test('generateWithFallback: параметр fallbackTimeoutMs корректно ограничивает время резервного вызова', async () => {
  let fallbackAllocatedTimeout = 0;

  const fakeAi = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        if (model === 'gemini-3.8-flash') {
          const err: any = new Error('503 Service Unavailable');
          err.status = 503;
          throw err;
        }
        return { text: '<html>Fallback Success</html>' };
      },
    },
  };

  const totalDeadline = Date.now() + 60000;

  await generateWithFallback({
    aiClient: fakeAi,
    primaryModel: 'gemini-3.8-flash',
    fallbackModel: 'gemini-3.6-flash',
    contents: 'Создай игру',
    timeoutMs: 38000,
    fallbackTimeoutMs: 32000,
    totalBudgetDeadline: totalDeadline,
    operationName: 'проверка fallbackTimeoutMs',
    onFallbackAttempt: ({ remainingTimeMs }) => {
      fallbackAllocatedTimeout = remainingTimeMs;
    },
  });

  assert.equal(fallbackAllocatedTimeout, 32000, 'Резервной модели должен быть передан заданный лимит 32с');
});

