/**
 * Модуль классификации и форматирования ошибок API генерации игр.
 * Преобразует технические ошибки Gemini API, сетевые сбои, таймауты и ошибки валидации
 * в понятные пользователю сообщения на русском языке.
 * Защищает от утечки секретов (API-ключей, токенов, сырых трейсов).
 */

export type ApiErrorCode =
  | 'AI_OVERLOADED'
  | 'RATE_LIMIT'
  | 'QUOTA_EXHAUSTED'
  | 'AUTH_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_REQUEST'
  | 'EMPTY_RESPONSE'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN_ERROR';

export interface ClassifiedError {
  code: ApiErrorCode;
  httpStatus: number;
  message: string;
  retryable: boolean;
  isModification?: boolean;
}

export interface ErrorClassificationOptions {
  isModification?: boolean;
}

const MODIFICATION_SUFFIX = ' Предыдущая версия игры сохранена без изменений.';

/**
 * Очищает строки от конфиденциальных данных (API-ключей, токенов, чувствительных URL).
 */
export function sanitizeErrorMessage(text: string): string {
  if (!text) return '';
  return text
    // Key query params: key=... or api_key=...
    .replace(/\b(key|api_key|apiKey)=([a-zA-Z0-9_\-\.]+)/gi, '$1=[HIDDEN_KEY]')
    // Google API keys: AIzaSy...
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[HIDDEN_KEY]')
    // Bearer tokens
    .replace(/Bearer\s+([a-zA-Z0-9_\-\.]+)/gi, 'Bearer [HIDDEN_TOKEN]');
}

/**
 * Классифицирует техническую ошибку и возвращает структурированный ответ.
 */
export function classifyApiError(
  rawError: unknown,
  options?: ErrorClassificationOptions
): ClassifiedError {
  const isMod = Boolean(options?.isModification);

  // 1. Быстрый возврат, если ошибка уже классифицирована
  if (
    typeof rawError === 'object' &&
    rawError !== null &&
    'code' in rawError &&
    'httpStatus' in rawError &&
    'message' in rawError
  ) {
    const existing = rawError as ClassifiedError;
    let msg = existing.message;
    if (isMod && !msg.includes('Предыдущая версия игры сохранена')) {
      msg = `${msg.trim()}${MODIFICATION_SUFFIX}`;
    }
    return {
      code: existing.code,
      httpStatus: existing.httpStatus,
      message: msg,
      retryable: existing.retryable,
      isModification: isMod,
    };
  }

  let errorStr = '';
  let statusOrCode = 0;
  let errorName = '';

  if (typeof rawError === 'string') {
    errorStr = rawError;
  } else if (typeof rawError === 'object' && rawError !== null) {
    const errObj = rawError as Record<string, any>;
    errorName = String(errObj.name || '');
    errorStr = String(errObj.message || errObj.error || errObj.statusText || '');

    if (typeof errObj.status === 'number') statusOrCode = errObj.status;
    if (typeof errObj.statusCode === 'number') statusOrCode = errObj.statusCode;
    if (typeof errObj.code === 'number') statusOrCode = errObj.code;
  }

  // Проверяем, есть ли JSON внутри сообщения (стандартный формат GoogleGenAI)
  const jsonMatch = errorStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error) {
        if (parsed.error.code && !isNaN(Number(parsed.error.code))) {
          statusOrCode = Number(parsed.error.code);
        }
        if (parsed.error.status) errorStr += ` ${parsed.error.status}`;
        if (parsed.error.message) errorStr += ` ${parsed.error.message}`;
      }
    } catch {
      // ignore parse error
    }
  }

  const combined = `${errorName} ${errorStr} ${statusOrCode || ''}`.toLowerCase();

  const wrapMessage = (baseMessage: string): string => {
    if (isMod && !baseMessage.includes('Предыдущая версия игры сохранена')) {
      return `${baseMessage.trim()}${MODIFICATION_SUFFIX}`;
    }
    return baseMessage.trim();
  };

  // 1. ИИ перегружен (503 / UNAVAILABLE)
  if (
    statusOrCode === 503 ||
    combined.includes('503') ||
    combined.includes('unavailable') ||
    combined.includes('high demand') ||
    combined.includes('overloaded') ||
    combined.includes('temporarily unavailable') ||
    combined.includes('model is overloaded')
  ) {
    return {
      code: 'AI_OVERLOADED',
      httpStatus: 503,
      message: wrapMessage('Сервис ИИ сейчас перегружен. Попробуйте немного позже.'),
      retryable: true,
      isModification: isMod,
    };
  }

  // 2. Исчерпана квота или недоступно использование API (проверяем ДО обычного 429 rate limit)
  const isExplicitQuotaExhausted =
    combined.includes('quota exceeded') ||
    combined.includes('quota_exceeded') ||
    combined.includes('insufficient_quota') ||
    combined.includes('billing not enabled') ||
    combined.includes('free tier limit') ||
    combined.includes('check your plan and billing') ||
    combined.includes('exceeded your current quota') ||
    (combined.includes('resource_exhausted') &&
      (combined.includes('quota') || combined.includes('billing') || combined.includes('plan')));

  if (isExplicitQuotaExhausted) {
    return {
      code: 'QUOTA_EXHAUSTED',
      httpStatus: 429,
      message: wrapMessage('Лимит использования ИИ исчерпан или доступ ограничен. Попробуйте позже или обратитесь к разработчику.'),
      retryable: false,
      isModification: isMod,
    };
  }

  // 3. Превышен лимит запросов (429) (временный rate limit)
  if (
    statusOrCode === 429 ||
    combined.includes('429') ||
    combined.includes('rate limit') ||
    combined.includes('ratelimitexceeded') ||
    combined.includes('too many requests') ||
    combined.includes('resource_exhausted') ||
    combined.includes('requests per minute') ||
    combined.includes('rpm') ||
    combined.includes('tpm')
  ) {
    return {
      code: 'RATE_LIMIT',
      httpStatus: 429,
      message: wrapMessage('Превышен лимит запросов к ИИ. Попробуйте позже.'),
      retryable: true,
      isModification: isMod,
    };
  }

  // 4. Ошибка авторизации или настройки API (401 / 403)
  if (
    statusOrCode === 401 ||
    statusOrCode === 403 ||
    combined.includes('401') ||
    combined.includes('403') ||
    combined.includes('permission_denied') ||
    combined.includes('unauthenticated') ||
    combined.includes('forbidden') ||
    combined.includes('api key not valid') ||
    combined.includes('invalid api key') ||
    combined.includes('ключ gemini_api_key') ||
    combined.includes('api-ключ')
  ) {
    return {
      code: 'AUTH_ERROR',
      httpStatus: statusOrCode === 403 ? 403 : 401,
      message: wrapMessage('Сервис ИИ недоступен из-за проблемы с настройкой доступа. Обратитесь к разработчику.'),
      retryable: false,
      isModification: isMod,
    };
  }

  // 5. Превышено время ожидания (504 / AbortError / Timeout)
  if (
    statusOrCode === 504 ||
    errorName === 'AbortError' ||
    combined.includes('504') ||
    combined.includes('aborterror') ||
    combined.includes('timed out') ||
    combined.includes('timeout') ||
    combined.includes('etimedout') ||
    combined.includes('deadline exceeded') ||
    combined.includes('gateway timeout') ||
    combined.includes('время ожидания')
  ) {
    return {
      code: 'TIMEOUT',
      httpStatus: 504,
      message: wrapMessage('ИИ не успел создать игру за отведённое время. Попробуйте ещё раз.'),
      retryable: true,
      isModification: isMod,
    };
  }

  // 6. Нет соединения с сервером / Сетевые ошибки
  if (
    combined.includes('failed to fetch') ||
    combined.includes('fetch failed') ||
    combined.includes('networkerror') ||
    combined.includes('network error') ||
    combined.includes('enotfound') ||
    combined.includes('econnrefused') ||
    combined.includes('econnreset') ||
    combined.includes('нет соединения') ||
    combined.includes('подключение к интернету') ||
    combined.includes('offline')
  ) {
    return {
      code: 'NETWORK_ERROR',
      httpStatus: 502,
      message: wrapMessage('Не удалось связаться с генератором. Проверьте подключение к интернету и попробуйте снова.'),
      retryable: true,
      isModification: isMod,
    };
  }

  // 7. 400 / Некорректный запрос (INVALID_ARGUMENT / пустой промпт)
  if (
    statusOrCode === 400 ||
    combined.includes('400') ||
    combined.includes('invalid_argument') ||
    combined.includes('bad request') ||
    combined.includes('описание игры') ||
    combined.includes('отсутствует исходный код')
  ) {
    return {
      code: 'INVALID_REQUEST',
      httpStatus: 400,
      message: wrapMessage('Не удалось обработать описание игры. Попробуйте сформулировать его проще.'),
      retryable: false,
      isModification: isMod,
    };
  }

  // 8. Пустой или некорректный ответ модели или сервера (включая HTML-страницы ошибок от прокси и сбой парсинга JSON)
  if (
    statusOrCode === 200 ||
    combined.includes('<!doctype') ||
    combined.includes('<html') ||
    combined.includes('пустой результат') ||
    combined.includes('пустой ответ') ||
    combined.includes('пустой') ||
    combined.includes('некорректный ответ') ||
    combined.includes('не смогла вернуть html') ||
    combined.includes('empty response') ||
    combined.includes('empty_response') ||
    combined.includes('не смог подготовить готовую игру') ||
    combined.includes('syntaxerror') ||
    combined.includes('unexpected end of json') ||
    combined.includes('unexpected token')
  ) {
    // Если внутри HTML или ошибки есть признаки тайм-аута шлюза/прокси (504 / gateway timeout)
    if (combined.includes('504') || combined.includes('timeout') || combined.includes('gateway')) {
      return {
        code: 'TIMEOUT',
        httpStatus: 504,
        message: wrapMessage('ИИ не успел создать игру за отведённое время. Попробуйте ещё раз.'),
        retryable: true,
        isModification: isMod,
      };
    }
    const isHtmlResponse = combined.includes('<!doctype') || combined.includes('<html');
    return {
      code: 'EMPTY_RESPONSE',
      httpStatus: 502,
      message: wrapMessage(
        isHtmlResponse
          ? 'Сервер вернул некорректный ответ вместо данных игры. Попробуйте ещё раз.'
          : 'ИИ не смог подготовить готовую игру. Попробуйте изменить описание.'
      ),
      retryable: true,
      isModification: isMod,
    };
  }

  // 9. Игра не прошла валидацию или проверку проходимости даже после исправления
  if (
    statusOrCode === 422 ||
    combined.includes('422') ||
    combined.includes('проверку безопасности') ||
    combined.includes('проверку проходимости') ||
    combined.includes('validation_failed') ||
    combined.includes('не прошла валидацию') ||
    combined.includes('не удалось подготовить рабочую игру')
  ) {
    return {
      code: 'VALIDATION_FAILED',
      httpStatus: 422,
      message: wrapMessage('Не удалось подготовить рабочую игру по этому запросу. Попробуйте упростить описание.'),
      retryable: true,
      isModification: isMod,
    };
  }

  // 10. Другая неизвестная ошибка
  return {
    code: 'UNKNOWN_ERROR',
    httpStatus: 500,
    message: wrapMessage('Не удалось создать игру из-за непредвиденной ошибки. Попробуйте ещё раз.'),
    retryable: true,
    isModification: isMod,
  };
}

/**
 * Возвращает дружелюбное сообщение на русском языке (для совместимости).
 */
export function formatFriendlyErrorMessage(
  rawError: unknown,
  options?: ErrorClassificationOptions
): string {
  return classifyApiError(rawError, options).message;
}

/**
 * Проверяет, относится ли ошибка к сбоям сервиса ИИ или сетевой инфраструктуры
 * (перегрузка, лимиты, квоты, таймауты, авторизация), а не к качеству сгенерированного кода.
 */
export function isApiLevelError(error: unknown): boolean {
  const classified = classifyApiError(error);
  return (
    classified.code === 'AI_OVERLOADED' ||
    classified.code === 'RATE_LIMIT' ||
    classified.code === 'QUOTA_EXHAUSTED' ||
    classified.code === 'AUTH_ERROR' ||
    classified.code === 'TIMEOUT' ||
    classified.code === 'NETWORK_ERROR'
  );
}

