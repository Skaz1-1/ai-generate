/**
 * Prompt Adapter & Mechanics Detection for 'Билайн ИИ-игры от Пакман'
 *
 * Pre-analyzes user prompts to detect 3D, WebGL, or complex mechanics,
 * gracefully adapting them to supported, standalone Canvas 2D implementations
 * (such as Raycasting or Isometric projection) and preventing broken code generation.
 */

export interface PromptAdaptationResult {
  adaptedPrompt: string;
  wasAdapted: boolean;
  adaptationNotice?: string;
  category?: '3d_raycast' | 'isometric' | 'standard';
}

/**
 * Analyzes the user's prompt and enriches it with strict architectural guidance
 * when unsupported or complex mechanics (e.g. 3D, external engines) are requested.
 */
export function adaptUserPrompt(rawPrompt: string): PromptAdaptationResult {
  const trimmed = rawPrompt.trim();
  const lower = trimmed.toLowerCase();

  // 1. Detect 3D / first-person / Raycasting keywords
  const is3dRequest =
    /\b3d\b/i.test(lower) ||
    /\b3д\b/i.test(lower) ||
    lower.includes('трёхмерн') ||
    lower.includes('трехмерн') ||
    lower.includes('от первого лица') ||
    lower.includes('вид из глаз') ||
    lower.includes('raycast') ||
    lower.includes('рейкаст') ||
    lower.includes('doom') ||
    lower.includes('wolfenstein') ||
    lower.includes('three.js') ||
    lower.includes('threejs') ||
    lower.includes('webgl');

  if (is3dRequest) {
    const guidance = `\n\n[АРХИТЕКТУРНОЕ ТРЕБОВАНИЕ ДЛЯ 3D]:
Пользователь запрашивает 3D-игру («${trimmed}»).
В нашей системе игры должны работать АВТОНОМНО без внешних библиотек (Three.js, Babylon.js и WebGL CDN ЗАПРЕЩЕНЫ).
Реализуй этот запрос через высокопроизводительный псевдо-3D алгоритм RAYCASTING (DDA на чистом Canvas 2D):
1. Отрисовка: вид от первого лица, пол и потолок с градиентами, стены с расчетом дистанции лучей, миникарта в правом верхнем углу.
2. Управление: клавиши WASD / Стрелки (шаг вперед/назад, стрейф или поворот) И сенсорные экранные кнопки внизу экрана (▲, ◀, ▼, ►, ↺, ↻).
3. Стартовый экран: <div id="start-screen" class="overlay"><button id="start-btn" class="big-btn">ИГРАТЬ</button></div>.
4. КАТЕГОРИЧЕСКИ НЕ используй класс THREE, WebGL шейдеры или requestPointerLock без защиты!
5. Обеспечь 100% проходимость уровня (свободный выход и все предметы достижимы).`;

    return {
      adaptedPrompt: trimmed + guidance,
      wasAdapted: true,
      adaptationNotice:
        '🎮 Запрос на 3D адаптирован: создана псевдо-3D игра на базе алгоритма Raycasting и Canvas 2D без внешних библиотек.',
      category: '3d_raycast',
    };
  }

  // 2. Standard 2D games pass through without extra adaptation
  return {
    adaptedPrompt: trimmed,
    wasAdapted: false,
    category: 'standard',
  };
}
