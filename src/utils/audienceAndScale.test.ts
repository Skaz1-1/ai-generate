import test from 'node:test';
import assert from 'node:assert/strict';
import { deduceAudienceFromPrompt, buildScaleDirective } from './gameParameters.ts';

test('1. Естественное распознавание аудитории: «Замути змейку для бабушки» определяет пожилую аудиторию и крупные элементы', () => {
  const result = deduceAudienceFromPrompt('Замути змейку для бабушки');

  assert.equal(result.audience, 'elderly');
  assert.ok(
    result.accessibilityDirectives.some((d) => d.includes('крупные кнопки') || d.includes('56')),
    'Должны быть предписаны крупные кнопки'
  );
  assert.ok(
    result.accessibilityDirectives.some((d) => d.includes('шрифт') || d.includes('22')),
    'Должен быть предписан крупный шрифт'
  );
  assert.ok(
    result.accessibilityDirectives.some((d) => d.includes('Спокойный темп') || d.includes('скорость')),
    'Должен быть предписан спокойный темп'
  );
});

test('2. Естественное распознавание аудитории: «Создай игру для ребёнка» определяет детскую аудиторию', () => {
  const result = deduceAudienceFromPrompt('Создай яркую игру для ребёнка с бабочками');

  assert.equal(result.audience, 'children');
  assert.ok(
    result.accessibilityDirectives.some((d) => d.includes('Простые') || d.includes('правила')),
    'Должны быть простые правила'
  );
  assert.ok(
    result.accessibilityDirectives.some((d) => d.includes('Красочное') || d.includes('оформление')),
    'Должно быть яркое оформление'
  );
});

test('3. Естественное распознавание аудитории: «Создай игру для опытного игрока» определяет профи аудиторию', () => {
  const result = deduceAudienceFromPrompt('Создай хардкорный платформер для опытного игрока');

  assert.equal(result.audience, 'hardcore');
  assert.ok(
    result.accessibilityDirectives.some((d) => d.includes('скилл') || d.includes('точность')),
    'Должен быть акцент на скилл и точность'
  );
});

test('4. Естественное распознавание аудитории: нейтральный запрос «Замути змейку» использует универсальные настройки', () => {
  const result = deduceAudienceFromPrompt('Замути змейку');

  assert.equal(result.audience, 'universal');
  assert.ok(
    result.accessibilityDirectives.some((d) => d.includes('Стандартный баланс')),
    'Должен использоваться стандартный баланс по умолчанию'
  );
});

test('5. Масштаб игры: Короткая, Средняя и Большая формируют правильные архитектурные директивы', () => {
  const shortDirective = buildScaleDirective('short');
  const mediumDirective = buildScaleDirective('medium');
  const largeDirective = buildScaleDirective('large');

  // Короткая
  assert.ok(shortDirective.includes('Короткая'));
  assert.ok(shortDirective.includes('1'));
  assert.ok(shortDirective.includes('раунд') || shortDirective.includes('уровень'));

  // Средняя
  assert.ok(mediumDirective.includes('Средняя'));
  assert.ok(mediumDirective.includes('несколько этапов') || mediumDirective.includes('2-3'));

  // Большая
  assert.ok(largeDirective.includes('Большая'));
  assert.ok(largeDirective.includes('4+') || largeDirective.includes('многоэтапная'));
});

test('6. Независимость доступности и сложности: бабушка + высокая сложность сохраняет доступность интерфейса', () => {
  const audience = deduceAudienceFromPrompt('Сложный космический лабиринт для дедушки');
  assert.equal(audience.audience, 'elderly');

  // Проверяем, что директивы доступности остаются в силе независимо от слова "сложный"
  assert.ok(audience.accessibilityDirectives.some((d) => d.includes('крупные кнопки')));
  assert.ok(audience.accessibilityDirectives.some((d) => d.includes('шрифт')));
});

test('7. Пояснения к сложности игры соответствуют требованиям ТЗ', () => {
  const difficultyHints: Record<string, string> = {
    'Лёгкая': 'Меньше препятствий, спокойнее темп и проще условия победы',
    'Средняя': 'Сбалансированные препятствия, темп и сложность',
    'Сложная': 'Больше испытаний, выше требования к реакции или точности',
  };

  assert.equal(difficultyHints['Лёгкая'], 'Меньше препятствий, спокойнее темп и проще условия победы');
  assert.equal(difficultyHints['Средняя'], 'Сбалансированные препятствия, темп и сложность');
  assert.equal(difficultyHints['Сложная'], 'Больше испытаний, выше требования к реакции или точности');
});

