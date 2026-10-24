import type { GameScale } from '../types.ts';

export interface AudienceDeduction {
  audience: 'elderly' | 'children' | 'hardcore' | 'universal';
  reasons: string[];
  accessibilityDirectives: string[];
}

/**
 * Analyzes natural language in user prompt to deduce audience and accessibility requirements.
 * Avoids stereotyping and only triggers when user prompt genuinely specifies an audience.
 */
export function deduceAudienceFromPrompt(rawPrompt: string): AudienceDeduction {
  if (!rawPrompt || typeof rawPrompt !== 'string') {
    return {
      audience: 'universal',
      reasons: ['Пустой запрос'],
      accessibilityDirectives: ['Стандартный баланс управления и читаемости'],
    };
  }

  const lower = rawPrompt.toLowerCase();

  // Elderly: бабушка, дедушка, пожилые, пенсионер
  const isElderly =
    /(?:^|[^а-яёa-z0-9])(бабушк[а-яё]*|дедушк[а-яё]*|пожил[а-яё]*|пенсионер[а-яё]*)(?:$|[^а-яёa-z0-9])/i.test(lower) ||
    lower.includes('для бабушки') ||
    lower.includes('для дедушки') ||
    lower.includes('для пожилых');

  if (isElderly) {
    return {
      audience: 'elderly',
      reasons: ['Обнаружено указание на пожилую аудиторию'],
      accessibilityDirectives: [
        'Очень крупные кнопки управления (от 56-64px)',
        'Крупный высококонтрастный шрифт инструкций и текста (от 22px)',
        'Спокойный темп игры и умеренная скорость',
      ],
    };
  }

  // Children: ребёнок, дети, малыш, первоклассник
  const isChild =
    /(?:^|[^а-яёa-z0-9])(дет[яеийь][а-яё]*|реб[её]нк[а-яё]*|малыш[а-яё]*|первоклассник[а-яё]*)(?:$|[^а-яёa-z0-9])/i.test(lower) ||
    lower.includes('для детей') ||
    lower.includes('для ребенка') ||
    lower.includes('для ребёнка');

  if (isChild) {
    return {
      audience: 'children',
      reasons: ['Обнаружено указание на детскую аудиторию'],
      accessibilityDirectives: [
        'Простые интуитивные правила',
        'Красочное оформление',
        'Прямое сенсорное управление',
      ],
    };
  }

  // Hardcore / experienced player: профи, опытный игрок, хардкор
  const isHardcore =
    /(?:^|[^а-яёa-z0-9])(опытн[а-яё]*\s*игрок[а-яё]*|профи|хардкор[а-яё]*)(?:$|[^а-яёa-z0-9])/i.test(lower) ||
    lower.includes('для опытного игрока') ||
    lower.includes('для профи');

  if (isHardcore) {
    return {
      audience: 'hardcore',
      reasons: ['Обнаружено указание на опытного игрока'],
      accessibilityDirectives: [
        'Акцент на скилл и точность',
        'Глубокие игровые механики',
      ],
    };
  }

  // Universal default
  return {
    audience: 'universal',
    reasons: ['Аудитория не указана, используются универсальные настройки'],
    accessibilityDirectives: [
      'Стандартный баланс управления и читаемости',
    ],
  };
}

export function buildScaleDirective(scale: GameScale): string {
  switch (scale) {
    case 'short':
      return 'Короткая (1 компактный уровень или быстрый раунд на 1-2 минуты, 1 разовая цель для победы)';
    case 'large':
      return 'Большая (многоэтапная игра: 4+ уровней или волн с возрастающей сложностью и финальной победой)';
    case 'medium':
    default:
      return 'Средняя (несколько этапов: 2-3 последовательных уровня или раунда с промежуточным экраном перехода)';
  }
}
