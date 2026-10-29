import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyApiError,
  formatFriendlyErrorMessage,
  sanitizeErrorMessage,
  isApiLevelError,
} from './errorMessage.ts';

// 1. 503 / UNAVAILABLE / ИИ перегружен
test('1. Ошибка 503 / UNAVAILABLE классифицируется как перегрузка ИИ с правильным сообщением', () => {
  const raw503 = 'Error: {"error":{"code":503,"message":"The model is currently experiencing high demand. Please try again later.","status":"UNAVAILABLE"}}';
  const classified = classifyApiError(raw503);

  assert.equal(classified.code, 'AI_OVERLOADED');
  assert.equal(classified.httpStatus, 503);
  assert.equal(classified.retryable, true);
  assert.equal(classified.message, 'Сервис ИИ сейчас перегружен. Попробуйте немного позже.');
  assert.doesNotMatch(classified.message, /503|UNAVAILABLE|\{/);
});

// 2. 429 / Превышен лимит запросов (RATE_LIMIT)
test('2. Ошибка 429 rate limit классифицируется как превышение лимита запросов', () => {
  const raw429 = 'Error: {"error":{"code":429,"message":"Rate limit exceeded for requests per minute.","status":"RESOURCE_EXHAUSTED"}}';
  const classified = classifyApiError(raw429);

  assert.equal(classified.code, 'RATE_LIMIT');
  assert.equal(classified.httpStatus, 429);
  assert.equal(classified.retryable, true);
  assert.equal(classified.message, 'Превышен лимит запросов к ИИ. Попробуйте позже.');
});

// 3. Исчерпана квота (QUOTA_EXHAUSTED)
test('3. Ошибка исчерпания квоты отличается от обычного временного rate limit', () => {
  const quotaErr = 'Error: {"error":{"code":429,"message":"You have exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}';
  const classified = classifyApiError(quotaErr);

  assert.equal(classified.code, 'QUOTA_EXHAUSTED');
  assert.equal(classified.httpStatus, 429);
  assert.equal(classified.retryable, false);
  assert.equal(
    classified.message,
    'Лимит использования ИИ исчерпан или доступ ограничен. Попробуйте позже или обратитесь к разработчику.'
  );
});

// 4. Ошибка авторизации (401 / 403 / AUTH_ERROR)
test('4. Ошибка 401 / 403 или недействительный API-ключ возвращает ошибку настройки доступа', () => {
  const auth403 = 'Error: {"error":{"code":403,"message":"API key not valid. Please pass a valid API key.","status":"PERMISSION_DENIED"}}';
  const classified = classifyApiError(auth403);

  assert.equal(classified.code, 'AUTH_ERROR');
  assert.equal(classified.httpStatus, 403);
  assert.equal(classified.retryable, false);
  assert.equal(
    classified.message,
    'Сервис ИИ недоступен из-за проблемы с настройкой доступа. Обратитесь к разработчику.'
  );

  const missingKeyErr = new Error('Ключ GEMINI_API_KEY не найден на сервере.');
  const classifiedMissing = classifyApiError(missingKeyErr);
  assert.equal(classifiedMissing.code, 'AUTH_ERROR');
  assert.equal(
    classifiedMissing.message,
    'Сервис ИИ недоступен из-за проблемы с настройкой доступа. Обратитесь к разработчику.'
  );
});

// 5. Сетевая ошибка (нет соединения)
test('5. Сетевая ошибка (Failed to fetch, ECONNREFUSED) возвращает сообщение о проверке интернета', () => {
  const fetchErr = new TypeError('Failed to fetch');
  const classified = classifyApiError(fetchErr);

  assert.equal(classified.code, 'NETWORK_ERROR');
  assert.equal(classified.httpStatus, 502);
  assert.equal(classified.retryable, true);
  assert.equal(
    classified.message,
    'Не удалось связаться с генератором. Проверьте подключение к интернету и попробуйте снова.'
  );

  const connRefused = new Error('connect ECONNREFUSED 127.0.0.1:443');
  const classifiedConn = classifyApiError(connRefused);
  assert.equal(classifiedConn.code, 'NETWORK_ERROR');
  assert.equal(
    classifiedConn.message,
    'Не удалось связаться с генератором. Проверьте подключение к интернету и попробуйте снова.'
  );
});

// 6. Таймаут (TIMEOUT / 504)
test('6. Таймаут запроса (AbortError / ETIMEDOUT / 504) возвращает сообщение о превышении времени', () => {
  const abortErr = new Error('The operation was aborted due to timeout');
  abortErr.name = 'AbortError';
  const classified = classifyApiError(abortErr);

  assert.equal(classified.code, 'TIMEOUT');
  assert.equal(classified.httpStatus, 504);
  assert.equal(classified.retryable, true);
  assert.equal(
    classified.message,
    'ИИ не успел создать игру за отведённое время. Попробуйте ещё раз.'
  );

  const timedOut504 = { status: 504, message: 'Gateway Timeout' };
  const classified504 = classifyApiError(timedOut504);
  assert.equal(classified504.code, 'TIMEOUT');
});

// 7. 400 / Некорректный запрос (INVALID_ARGUMENT)
test('7. Ошибка 400 или INVALID_ARGUMENT возвращает рекомендацию сформулировать проще', () => {
  const invalidArg = 'Error: {"error":{"code":400,"message":"Invalid argument provided","status":"INVALID_ARGUMENT"}}';
  const classified = classifyApiError(invalidArg);

  assert.equal(classified.code, 'INVALID_REQUEST');
  assert.equal(classified.httpStatus, 400);
  assert.equal(classified.retryable, false);
  assert.equal(
    classified.message,
    'Не удалось обработать описание игры. Попробуйте сформулировать его проще.'
  );
});

// 8. Пустой или некорректный ответ модели
test('8. Пустой ответ модели возвращает рекомендацию изменить описание', () => {
  const emptyErr = new Error('Модель вернула пустой результат или некорректный ответ');
  const classified = classifyApiError(emptyErr);

  assert.equal(classified.code, 'EMPTY_RESPONSE');
  assert.equal(classified.httpStatus, 502);
  assert.equal(classified.retryable, true);
  assert.equal(
    classified.message,
    'ИИ не смог подготовить готовую игру. Попробуйте изменить описание.'
  );
});

// 9. Ошибка проходимости / валидации (422)
test('9. Ошибка проходимости или валидации игры возвращает понятное сообщение', () => {
  const verifErr = {
    status: 422,
    message: 'Игра не прошла проверку проходимости после всех попыток',
  };
  const classified = classifyApiError(verifErr);

  assert.equal(classified.code, 'VALIDATION_FAILED');
  assert.equal(classified.httpStatus, 422);
  assert.equal(classified.retryable, true);
  assert.equal(
    classified.message,
    'Не удалось подготовить рабочую игру по этому запросу. Попробуйте упростить описание.'
  );
});

// 10. Неизвестная ошибка
test('10. Неизвестная ошибка возвращает общее понятное сообщение без технических данных', () => {
  const weirdErr = new Error('Unexpected memory bus error 0xDEADBEEF');
  const classified = classifyApiError(weirdErr);

  assert.equal(classified.code, 'UNKNOWN_ERROR');
  assert.equal(classified.httpStatus, 500);
  assert.equal(classified.retryable, true);
  assert.equal(
    classified.message,
    'Не удалось создать игру из-за непредвиденной ошибки. Попробуйте ещё раз.'
  );
  assert.doesNotMatch(classified.message, /0xDEADBEEF|memory bus/);
});

// 11. Режим модификации сохраняет предыдущую версию игры
test('11. В режиме модификации к ошибке добавляется указание о сохранении предыдущей версии', () => {
  const raw503 = 'Error: 503 UNAVAILABLE';
  const classified = classifyApiError(raw503, { isModification: true });

  assert.equal(
    classified.message,
    'Сервис ИИ сейчас перегружен. Попробуйте немного позже. Предыдущая версия игры сохранена без изменений.'
  );

  const timeoutErr = new Error('ETIMEDOUT');
  const classifiedTimeout = classifyApiError(timeoutErr, { isModification: true });
  assert.equal(
    classifiedTimeout.message,
    'ИИ не успел создать игру за отведённое время. Попробуйте ещё раз. Предыдущая версия игры сохранена без изменений.'
  );
});

// 12. Очистка секретов и API-ключей (sanitizeErrorMessage)
test('12. sanitizeErrorMessage надёжно маскирует Google API-ключи и Bearer токены', () => {
  const leakedText = 'Request to https://api.google.com?key=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6 failed with Bearer secret-token-123';
  const sanitized = sanitizeErrorMessage(leakedText);

  assert.doesNotMatch(sanitized, /AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6/);
  assert.doesNotMatch(sanitized, /secret-token-123/);
  assert.match(sanitized, /\[HIDDEN_KEY\]/);
  assert.match(sanitized, /\[HIDDEN_TOKEN\]/);
});

// 13. isApiLevelError отличает сетевые сбои и ошибки API от ошибок валидации
test('13. isApiLevelError безошибочно разделяет сбои сервиса ИИ и ошибки валидации геймплея', () => {
  // Ошибки сервиса ИИ должны давать true
  assert.equal(isApiLevelError({ status: 503, message: 'UNAVAILABLE' }), true);
  assert.equal(isApiLevelError({ status: 429, message: 'RATE_LIMIT' }), true);
  assert.equal(isApiLevelError({ status: 504, message: 'TIMEOUT' }), true);
  assert.equal(isApiLevelError(new TypeError('Failed to fetch')), true);
  assert.equal(isApiLevelError({ status: 401, message: 'API key invalid' }), true);

  // Ошибки валидации игры и пользовательского ввода должны давать false
  assert.equal(isApiLevelError({ status: 422, message: 'VALIDATION_FAILED' }), false);
  assert.equal(isApiLevelError({ status: 400, message: 'INVALID_REQUEST' }), false);
});

// 14. Сбой Gemini 503 при авто-исправлении не маскируется под 422 VALIDATION_FAILED
test('14. Сбой Gemini 503 при авто-исправлении сохраняет тип AI_OVERLOADED и не маскируется под ошибку кода', () => {
  const secondaryGeminiError = new Error(
    '{"error":{"code":503,"message":"The model is currently experiencing high demand. Please try again later.","status":"UNAVAILABLE"}}'
  );

  // Проверяем, что сервер классифицирует эту ошибку как системную
  assert.equal(isApiLevelError(secondaryGeminiError), true);
  const classified = classifyApiError(secondaryGeminiError);
  assert.equal(classified.code, 'AI_OVERLOADED');
  assert.equal(classified.httpStatus, 503);
  assert.equal(classified.retryable, true);
  assert.equal(classified.message, 'Сервис ИИ сейчас перегружен. Попробуйте немного позже.');
});

// 15. Сбой Gemini 429 при авто-исправлении сохраняет тип RATE_LIMIT и не маскируется под ошибку кода
test('15. Сбой Gemini 429 при авто-исправлении сохраняет тип RATE_LIMIT и статус 429', () => {
  const secondaryRateLimit = new Error(
    '{"error":{"code":429,"message":"Resource exhausted: rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}'
  );

  assert.equal(isApiLevelError(secondaryRateLimit), true);
  const classified = classifyApiError(secondaryRateLimit);
  assert.equal(classified.code, 'RATE_LIMIT');
  assert.equal(classified.httpStatus, 429);
  assert.equal(classified.retryable, true);
  assert.equal(classified.message, 'Превышен лимит запросов к ИИ. Попробуйте позже.');
});

// 16. Превышение тайм-аута (504 TimeoutError) классифицируется с кодом TIMEOUT и статусом 504
test('16. Превышение тайм-аута этапа классифицируется как TIMEOUT (504)', () => {
  const timeoutErr: any = new Error('Превышено время ожидания этапа "первичная генерация Gemini" (45000мс)');
  timeoutErr.name = 'TimeoutError';
  timeoutErr.status = 504;

  assert.equal(isApiLevelError(timeoutErr), true);
  const classified = classifyApiError(timeoutErr);
  assert.equal(classified.code, 'TIMEOUT');
  assert.equal(classified.httpStatus, 504);
  assert.equal(classified.retryable, true);
  assert.equal(classified.message, 'ИИ не успел создать игру за отведённое время. Попробуйте ещё раз.');
});

// 17. Ошибка status: 200 с пустым телом классифицируется как EMPTY_RESPONSE (502)
test('17. Ошибка { status: 200, message: "" } классифицируется как EMPTY_RESPONSE (502)', () => {
  const empty200 = { status: 200, message: '' };
  const classified = classifyApiError(empty200);

  assert.equal(classified.code, 'EMPTY_RESPONSE');
  assert.equal(classified.httpStatus, 502);
  assert.equal(classified.retryable, true);
  assert.equal(classified.message, 'ИИ не смог подготовить готовую игру. Попробуйте изменить описание.');
});


