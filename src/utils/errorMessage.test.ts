import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFriendlyErrorMessage } from './errorMessage.ts';

test('formatFriendlyErrorMessage converts 503 JSON into friendly Russian message', () => {
  const raw503 = 'Не удалось сгенерировать игру: {"error":{"code":503,"message":"This model is currently experiencing high demand...","status":"UNAVAILABLE"}}';
  const formatted = formatFriendlyErrorMessage(raw503);

  assert.equal(
    formatted,
    'Не удалось создать игру. Сервис ИИ сейчас перегружен. Попробуйте ещё раз немного позже.'
  );
  assert.doesNotMatch(formatted, /503/);
  assert.doesNotMatch(formatted, /UNAVAILABLE/);
  assert.doesNotMatch(formatted, /\{/);
});

test('formatFriendlyErrorMessage converts 429 / RESOURCE_EXHAUSTED into friendly Russian message', () => {
  const raw429 = 'Error: {"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}';
  const formatted = formatFriendlyErrorMessage(raw429);

  assert.equal(
    formatted,
    'Сейчас превышен лимит запросов к ИИ. Попробуйте снова позже.'
  );
  assert.doesNotMatch(formatted, /429/);
  assert.doesNotMatch(formatted, /RESOURCE_EXHAUSTED/);
});

test('formatFriendlyErrorMessage converts network error into friendly Russian message', () => {
  const netError = new TypeError('Failed to fetch');
  const formatted = formatFriendlyErrorMessage(netError);

  assert.equal(
    formatted,
    'Не удалось связаться с сервисом ИИ. Проверьте подключение к интернету и попробуйте снова.'
  );
});

test('formatFriendlyErrorMessage converts ECONNREFUSED into friendly Russian message', () => {
  const connError = new Error('connect ECONNREFUSED 127.0.0.1:443');
  const formatted = formatFriendlyErrorMessage(connError);

  assert.equal(
    formatted,
    'Не удалось связаться с сервисом ИИ. Проверьте подключение к интернету и попробуйте снова.'
  );
});

test('formatFriendlyErrorMessage falls back to general Russian message on other errors', () => {
  const unknownError = new Error('Random internal syntax anomaly');
  const formatted = formatFriendlyErrorMessage(unknownError);

  assert.equal(
    formatted,
    'Не удалось создать игру. Попробуйте ещё раз.'
  );
});
