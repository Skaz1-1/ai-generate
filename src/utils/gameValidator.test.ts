import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHtmlCode, validateGameHtml } from './gameValidator.ts';

test('extractHtmlCode extracts pure html from markdown block', () => {
  const markdown = 'Here is the game code:\n```html\n<!DOCTYPE html>\n<html><head><title>Test</title></head><body><script>console.log(1);</script></body></html>\n```\nEnjoy!';
  const extracted = extractHtmlCode(markdown);
  assert.ok(extracted.startsWith('<!DOCTYPE html>'));
  assert.ok(extracted.endsWith('</html>'));
  assert.ok(!extracted.includes('```'));
  assert.ok(!extracted.includes('Here is the game code'));
});

test('extractHtmlCode handles raw html without markdown', () => {
  const raw = '<!DOCTYPE html><html><body><h1>Game</h1><script>let a=1;</script></body></html>';
  const extracted = extractHtmlCode(raw);
  assert.equal(extracted, raw);
});

test('validateGameHtml succeeds for valid self-contained HTML5 game', () => {
  const validHtml = `<!DOCTYPE html>
  <html lang="ru">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>body { margin: 0; background: #000; }</style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script>
      const c = document.getElementById('game');
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFBE00';
      ctx.fillRect(10, 10, 50, 50);
    </script>
  </body>
  </html>`;

  const result = validateGameHtml(validHtml);
  assert.equal(result.isValid, true);
  assert.equal(result.error, undefined);
});

test('validateGameHtml rejects missing script tag', () => {
  const noScript = '<html><head></head><body><h1>Hello</h1></body></html>';
  const result = validateGameHtml(noScript);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes('<script>'));
});

test('validateGameHtml rejects external CDN scripts', () => {
  const cdnHtml = `<html><head><script src="https://cdnjs.cloudflare.com/ajax/libs/phaser/3.55.2/phaser.min.js"></script></head><body><script>console.log(Phaser);</script></body></html>`;
  const result = validateGameHtml(cdnHtml);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes('CDN') || result.error?.includes('внешние скрипты'));
});

test('validateGameHtml rejects network calls like fetch', () => {
  const networkHtml = `<html><head></head><body><script>fetch('https://api.example.com/score');</script></body></html>`;
  const result = validateGameHtml(networkHtml);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes('сетевые запросы'));
});

test('validateGameHtml rejects unsupported Three.js references', () => {
  const threeHtml = `<html><head></head><body><script>const scene = new THREE.Scene();</script></body></html>`;
  const result = validateGameHtml(threeHtml);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes('Three.js'));
});

