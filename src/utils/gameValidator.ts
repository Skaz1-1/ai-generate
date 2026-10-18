/**
 * Game HTML validation and extraction utilities for 'Билайн ИИ-игры от Пакман'
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings: string[];
}

/**
 * Extracts pure HTML code from LLM output, handling markdown blocks and conversational text.
 */
export function extractHtmlCode(raw: string): string {
  if (!raw) return '';

  let text = raw.trim();

  // If wrapped in ```html ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/```(?:html|xml)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    text = codeBlockMatch[1].trim();
  }

  // Find start of HTML document
  const htmlStartMatch = text.search(/<!DOCTYPE html|<html/i);
  if (htmlStartMatch !== -1) {
    text = text.slice(htmlStartMatch);
  }

  // Find end of HTML document
  const htmlEndMatch = text.search(/<\/html>/i);
  if (htmlEndMatch !== -1) {
    text = text.slice(0, htmlEndMatch + 7);
  }

  return text.trim();
}

/**
 * Validates that the generated game is a self-contained, safe, standalone HTML5 game.
 */
export function validateGameHtml(html: string): ValidationResult {
  const warnings: string[] = [];

  if (!html || typeof html !== 'string' || html.trim().length < 50) {
    return {
      isValid: false,
      error: 'Сгенерированный ответ пуст или слишком короткий.',
      warnings,
    };
  }

  const lower = html.toLowerCase();

  // 1. Must contain basic HTML structure
  const hasHtmlTag = lower.includes('<html') && lower.includes('</html>');
  const hasScriptTag = lower.includes('<script') && lower.includes('</script>');

  if (!hasHtmlTag) {
    return {
      isValid: false,
      error: 'Ответ не содержит корректную HTML-структуру (отсутствует тег <html>).',
      warnings,
    };
  }

  if (!hasScriptTag) {
    return {
      isValid: false,
      error: 'Ответ не содержит JavaScript-кода (отсутствует тег <script>).',
      warnings,
    };
  }

  // 2. Reject external network dependencies: CDN, external script src, external link href
  const externalScriptRegex = /<script[^>]+src=["'](https?:|\/\/)[^"']+["']/i;
  if (externalScriptRegex.test(html)) {
    return {
      isValid: false,
      error: 'Игра содержит внешние скрипты (CDN). Игра должна быть полностью автономной.',
      warnings,
    };
  }

  const externalStylesheetRegex = /<link[^>]+href=["'](https?:|\/\/)[^"']+["']/i;
  if (externalStylesheetRegex.test(html)) {
    return {
      isValid: false,
      error: 'Игра содержит внешние таблицы стилей. Игра должна быть полностью автономной.',
      warnings,
    };
  }

  const externalFontRegex = /@import\s+url\(["']?(https?:|\/\/)/i;
  if (externalFontRegex.test(html)) {
    warnings.push('Обнаружен импорт внешнего шрифта. Рекомендуется использовать системные шрифты.');
  }

  // 3. Reject active network calls in game logic (must run offline without server)
  const networkCallRegex = /(?:fetch\s*\(|new\s+XMLHttpRequest|new\s+WebSocket|navigator\.sendBeacon\s*\()/i;
  if (networkCallRegex.test(html)) {
    return {
      isValid: false,
      error: 'Игра пытается отправлять сетевые запросы во время игрового процесса. Требуется автономная работа.',
      warnings,
    };
  }

  // 4. Check for undefined 3D library calls without library definition
  const unsupportedEngineRegex = /(?:new\s+THREE\.|THREE\.\w+|new\s+BABYLON\.|BABYLON\.\w+)/;
  if (unsupportedEngineRegex.test(html)) {
    return {
      isValid: false,
      error: 'Игра пытается обращаться к Three.js / WebGL-движку, который не поддерживается в автономном режиме. Игра должна использовать автономный Canvas 2D (Raycasting или изометрию).',
      warnings,
    };
  }

  // 5. Check that game has interactive start controls
  const hasButton = /<button[\s>]/i.test(html) || /<input[^>]+type=["'](?:button|submit)["']/i.test(html);
  if (!hasButton) {
    warnings.push('В игре не обнаружено стандартного тега <button> для запуска. Рекомендуется явная кнопка старта.');
  }

  // 6. Recommend meta viewport for mobile friendliness
  if (!lower.includes('viewport')) {
    warnings.push('Рекомендуется добавить мета-тег viewport для идеального отображения на мобильных экранах.');
  }

  return {
    isValid: true,
    warnings,
  };
}
