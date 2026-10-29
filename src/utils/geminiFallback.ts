import { classifyApiError } from './errorMessage.js';

export interface ModelCallOptions {
  systemInstruction?: string;
  temperature?: number;
}

export interface FallbackCallParams {
  aiClient: {
    models: {
      generateContent: (args: {
        model: string;
        contents: any;
        config?: any;
      }) => Promise<any>;
    };
  };
  primaryModel: string;
  fallbackModel?: string;
  contents: string;
  config?: ModelCallOptions;
  timeoutMs: number;
  fallbackTimeoutMs?: number;
  totalBudgetDeadline?: number;
  operationName: string;
  requestId?: string;
  isAborted?: () => boolean;
  onFallbackAttempt?: (info: {
    primaryError: unknown;
    fallbackModel: string;
    remainingTimeMs: number;
  }) => void;
}

export interface ModelCallResult {
  text: string;
  modelUsed: string;
  usedFallback: boolean;
}

/**
 * Минимальный остаток времени (в мс), необходимый для попытки вызова резервной модели.
 * Если времени меньше 12 секунд, запуск резервного вызова нецелесообразен,
 * так как модель не успеет сгенерировать полный код игры до срабатывания тайм-аута.
 */
export const MIN_FALLBACK_TIME_BUDGET_MS = 12000;

/**
 * Проверяет, подходит ли ошибка под условия переключения на резервную модель.
 *
 * Критерии:
 * - Запрос НЕ должен быть отменён клиентом (isAborted = false).
 * - Ошибка должна иметь статус 503 (AI_OVERLOADED), 504 (TIMEOUT),
 *   либо быть подтверждённой временной сетевой ошибкой (NETWORK_ERROR).
 *
 * ЗАПРЕЩЕНО переключаться на резервную модель при:
 * - 400 (INVALID_REQUEST / некорректный запрос);
 * - 401 / 403 (AUTH_ERROR / ошибка ключа доступа);
 * - 422 (VALIDATION_FAILED / ошибка структуры или проходимости);
 * - 429 (RATE_LIMIT / QUOTA_EXHAUSTED / превышен лимит или исчерпана квота).
 */
export function isEligibleForFallback(error: unknown, isAborted?: boolean): boolean {
  if (isAborted) {
    return false;
  }

  // Извлекаем статус-код, если он явно задан в объекте ошибки
  let rawStatus = 0;
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>;
    if (typeof errObj.status === 'number') rawStatus = errObj.status;
    else if (typeof errObj.statusCode === 'number') rawStatus = errObj.statusCode;
  }

  // Явные запреты по статус-кодам
  if (rawStatus === 400 || rawStatus === 401 || rawStatus === 403 || rawStatus === 422 || rawStatus === 429) {
    return false;
  }

  const classified = classifyApiError(error);

  // Категорический запрет для квот, лимитов, авторизации и валидации
  if (
    classified.code === 'RATE_LIMIT' ||
    classified.code === 'QUOTA_EXHAUSTED' ||
    classified.code === 'AUTH_ERROR' ||
    classified.code === 'INVALID_REQUEST' ||
    classified.code === 'VALIDATION_FAILED'
  ) {
    return false;
  }

  // Разрешено только для перегрузки (503), тайм-аута (504) и временных сбоев сети
  return (
    classified.code === 'AI_OVERLOADED' ||
    classified.code === 'TIMEOUT' ||
    classified.code === 'NETWORK_ERROR' ||
    rawStatus === 503 ||
    rawStatus === 504
  );
}

/**
 * Выполняет асинхронную операцию с контролируемым тайм-аутом.
 */
export function withCallTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(
        `Превышено время ожидания этапа "${operationName}" (${timeoutMs}мс)`
      );
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
 * Выполняет вызов Gemini API с поддержкой ровно одной резервной попытки
 * при возникновении ошибок 503, 504 или временных сбоев сети.
 */
export async function generateWithFallback(
  params: FallbackCallParams
): Promise<ModelCallResult> {
  const {
    aiClient,
    primaryModel,
    fallbackModel,
    contents,
    config,
    timeoutMs,
    fallbackTimeoutMs,
    totalBudgetDeadline,
    operationName,
    requestId = 'gen',
    isAborted,
    onFallbackAttempt,
  } = params;

  // 1. Проверяем статус отмены клиентом перед началом работы
  if (isAborted && isAborted()) {
    const abortErr: any = new Error('Запрос отменен клиентом.');
    abortErr.name = 'AbortError';
    abortErr.status = 499;
    throw abortErr;
  }

  // 2. Рассчитываем тайм-аут для первого вызова с учётом общего дедлайна
  const now = Date.now();
  let primaryTimeout = timeoutMs;
  if (totalBudgetDeadline) {
    const remainingTotal = totalBudgetDeadline - now;
    if (remainingTotal <= 4000) {
      const timeoutErr: any = new Error(
        `Превышено общее время выполнения операции "${operationName}".`
      );
      timeoutErr.name = 'TimeoutError';
      timeoutErr.status = 504;
      timeoutErr.code = 'TIMEOUT';
      throw timeoutErr;
    }
    // Оставляем запас времени для возможных последующих этапов и сериализации ответа
    primaryTimeout = Math.min(timeoutMs, remainingTotal - 2000);
  }

  // 3. Вызов основной модели
  try {
    const response = await withCallTimeout(
      aiClient.models.generateContent({
        model: primaryModel,
        contents,
        config,
      }),
      primaryTimeout,
      `${operationName} (${primaryModel})`
    );

    return {
      text: response?.text || '',
      modelUsed: primaryModel,
      usedFallback: false,
    };
  } catch (primaryError: any) {
    // 4. Если запрос отменён клиентом во время выполнения, не переключаемся на резерв
    const abortedNow = Boolean(isAborted && isAborted());
    if (abortedNow) {
      throw primaryError;
    }

    // 5. Проверяем, настроена ли резервная модель и подходит ли ошибка под условия переключения
    if (!fallbackModel || fallbackModel === primaryModel) {
      throw primaryError;
    }

    const canFallback = isEligibleForFallback(primaryError, abortedNow);
    if (!canFallback) {
      // Ошибки 400, 401, 403, 422, 429 сразу выбрасываются без резервной попытки
      throw primaryError;
    }

    // 6. Проверяем оставшийся бюджет времени
    let fallbackTimeout = fallbackTimeoutMs || timeoutMs;
    if (totalBudgetDeadline) {
      const remainingForFallback = totalBudgetDeadline - Date.now();
      if (remainingForFallback < MIN_FALLBACK_TIME_BUDGET_MS) {
        console.warn(
          `[REQ-${requestId}] [Резервная модель] Недостаточно времени до общего дедлайна (осталось ${remainingForFallback}мс < ${MIN_FALLBACK_TIME_BUDGET_MS}мс). Резервный вызов отменен.`
        );
        throw primaryError;
      }
      fallbackTimeout = Math.min(fallbackTimeout, remainingForFallback - 2000);
    }

    // 7. Оповещаем / логируем переключение на резервную модель
    if (onFallbackAttempt) {
      onFallbackAttempt({
        primaryError,
        fallbackModel,
        remainingTimeMs: fallbackTimeout,
      });
    }

    // 8. Ровно одна попытка через резервную модель
    try {
      const fallbackResponse = await withCallTimeout(
        aiClient.models.generateContent({
          model: fallbackModel,
          contents,
          config,
        }),
        fallbackTimeout,
        `${operationName} резерв (${fallbackModel})`
      );

      return {
        text: fallbackResponse?.text || '',
        modelUsed: fallbackModel,
        usedFallback: true,
      };
    } catch (fallbackError: any) {
      // Никаких повторных попыток: выбрасываем ошибку резервной модели
      throw fallbackError;
    }
  }
}
