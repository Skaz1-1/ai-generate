import test from 'node:test';
import assert from 'node:assert';
import { injectRuntimeGuard, RUNTIME_GUARD_SCRIPT } from './gameRuntimeGuard.ts';

test('injectRuntimeGuard inserts guard script right after <head>', () => {
  const sample = '<!DOCTYPE html><html><head><title>Game</title></head><body><button id="start-btn">Играть</button></body></html>';
  const result = injectRuntimeGuard(sample);

  assert.ok(result.includes('aigames-guard-script'));
  assert.ok(result.includes('aigames-guard-styles'));
  assert.ok(result.includes('createMemoryStorage'));
  assert.ok(result.includes('setupButtonFallbacks'));
  assert.ok(result.indexOf('aigames-guard-script') < result.indexOf('<title>Game</title>'));
});

test('injectRuntimeGuard does not duplicate script if already injected', () => {
  const sample = '<!DOCTYPE html><html><head><title>Game</title></head><body></body></html>';
  const injectedOnce = injectRuntimeGuard(sample);
  const injectedTwice = injectRuntimeGuard(injectedOnce);

  const occurrences = (injectedTwice.match(/aigames-guard-script/g) || []).length;
  assert.strictEqual(occurrences, 1);
});

test('injectRuntimeGuard handles HTML without explicit head tag', () => {
  const sample = '<html><body><h1>Play</h1></body></html>';
  const result = injectRuntimeGuard(sample);

  assert.ok(result.includes('aigames-guard-script'));
  assert.ok(result.includes('<h1>Play</h1>'));
});
