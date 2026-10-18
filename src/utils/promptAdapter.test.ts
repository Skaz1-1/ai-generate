import test from 'node:test';
import assert from 'node:assert';
import { adaptUserPrompt } from './promptAdapter.ts';

test('adaptUserPrompt detects 3D labyrinth and enriches prompt with Raycasting instructions', () => {
  const result = adaptUserPrompt('Создай 3D-лабиринт');
  assert.strictEqual(result.wasAdapted, true);
  assert.strictEqual(result.category, '3d_raycast');
  assert.ok(result.adaptedPrompt.includes('RAYCASTING'));
  assert.ok(result.adaptedPrompt.includes('Canvas 2D'));
  assert.ok(result.adaptationNotice?.includes('3D'));
});

test('adaptUserPrompt detects Three.js and redirects to standalone Canvas', () => {
  const result = adaptUserPrompt('Сделай трехмерную гонку на three.js');
  assert.strictEqual(result.wasAdapted, true);
  assert.strictEqual(result.category, '3d_raycast');
  assert.ok(result.adaptedPrompt.includes('Three.js, Babylon.js и WebGL CDN ЗАПРЕЩЕНЫ'));
});

test('adaptUserPrompt leaves standard 2D game prompts untouched', () => {
  const result = adaptUserPrompt('Пакман собирает монетки');
  assert.strictEqual(result.wasAdapted, false);
  assert.strictEqual(result.category, 'standard');
  assert.strictEqual(result.adaptedPrompt, 'Пакман собирает монетки');
  assert.strictEqual(result.adaptationNotice, undefined);
});
