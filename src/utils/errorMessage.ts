/**
 * Converts technical AI / server / network errors into user-friendly Russian messages.
 * Never exposes raw JSON, HTTP codes, or internal API status details to the end user.
 */
export function formatFriendlyErrorMessage(rawError: unknown): string {
  if (!rawError) {
    return 'Не удалось создать игру. Попробуйте ещё раз.';
  }

  let errorStr = '';
  let statusOrCode = 0;

  if (typeof rawError === 'string') {
    errorStr = rawError;
  } else if (typeof rawError === 'object' && rawError !== null) {
    const errObj = rawError as Record<string, any>;
    errorStr = String(errObj.message || errObj.error || errObj.statusText || '');
    if (typeof errObj.status === 'number') statusOrCode = errObj.status;
    if (typeof errObj.code === 'number') statusOrCode = errObj.code;

    // Check if error message itself contains JSON
    const jsonMatch = errorStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.error) {
          if (parsed.error.code) statusOrCode = Number(parsed.error.code);
          if (parsed.error.status) errorStr += ` ${parsed.error.status}`;
          if (parsed.error.message) errorStr += ` ${parsed.error.message}`;
        }
      } catch {
        // keep string
      }
    }
  }

  const combined = `${errorStr} ${statusOrCode || ''}`.toLowerCase();

  // 1. 503 / UNAVAILABLE / high demand / overloaded
  if (
    statusOrCode === 503 ||
    combined.includes('503') ||
    combined.includes('unavailable') ||
    combined.includes('high demand') ||
    combined.includes('overloaded') ||
    combined.includes('temporarily unavailable')
  ) {
    return 'Не удалось создать игру. Сервис ИИ сейчас перегружен. Попробуйте ещё раз немного позже.';
  }

  // 2. 429 / RESOURCE_EXHAUSTED / quota exceeded
  if (
    statusOrCode === 429 ||
    combined.includes('429') ||
    combined.includes('resource_exhausted') ||
    combined.includes('quota') ||
    combined.includes('rate limit') ||
    combined.includes('too many requests')
  ) {
    return 'Сейчас превышен лимит запросов к ИИ. Попробуйте снова позже.';
  }

  // 3. Connection / Network errors
  if (
    combined.includes('failed to fetch') ||
    combined.includes('fetch failed') ||
    combined.includes('enotfound') ||
    combined.includes('econnrefused') ||
    combined.includes('econnreset') ||
    combined.includes('etimedout') ||
    combined.includes('networkerror') ||
    combined.includes('network error') ||
    combined.includes('подключение к интернету')
  ) {
    return 'Не удалось связаться с сервисом ИИ. Проверьте подключение к интернету и попробуйте снова.';
  }

  // 4. Other errors
  return 'Не удалось создать игру. Попробуйте ещё раз.';
}
