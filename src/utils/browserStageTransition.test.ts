import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';

function isServerRunning(port = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

test('Браузерный тест: Полный цикл перехода между этапами в реальном браузере Chromium', async (t) => {
  const serverUp = await isServerRunning(3000);
  if (!serverUp) {
    t.skip('Сервер http://localhost:3000 недоступен для запуска браузерного теста');
    return;
  }

  try {
    // 1. Open browser to test page
    execSync('playwright-cli open --browser=chromium http://localhost:3000/test_multistage.html', {
      encoding: 'utf-8',
      timeout: 15000,
    });

    // 2. Click start button
    execSync('playwright-cli click "#start-btn"', { encoding: 'utf-8', timeout: 5000 });
    const stage1State = execSync(
      `playwright-cli eval "() => document.getElementById('current-stage-display').textContent + '|' + document.getElementById('player-x-display').textContent"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    assert.ok(stage1State.includes('1|20'), `Этап 1 должен быть активен с координатами X=20, получено: ${stage1State}`);

    // 3. Complete stage 1
    execSync('playwright-cli click "#sim-win-btn"', { encoding: 'utf-8', timeout: 5000 });
    const isNextScreenHidden = execSync(
      `playwright-cli eval "() => document.getElementById('next-screen').classList.contains('hidden')"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    assert.ok(isNextScreenHidden.includes('false'), 'Экран перехода на следующий этап должен отображаться (hidden=false)');

    // 4. Click next level button
    execSync('playwright-cli click "#next-btn"', { encoding: 'utf-8', timeout: 5000 });
    const stage2State = execSync(
      `playwright-cli eval "() => document.getElementById('current-stage-display').textContent + '|' + document.getElementById('player-x-display').textContent + '|' + document.getElementById('target-display').textContent"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    assert.ok(
      stage2State.includes('2|80|5'),
      `Этап 2 должен быть загружен с обновленным счётом (5) и сброшенной позицией X=80, получено: ${stage2State}`
    );

    // 5. Complete stage 2 (last stage) -> Win screen
    execSync('playwright-cli click "#sim-win-btn"', { encoding: 'utf-8', timeout: 5000 });
    const isWinScreenHidden = execSync(
      `playwright-cli eval "() => document.getElementById('win-screen').classList.contains('hidden')"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    assert.ok(isWinScreenHidden.includes('false'), 'Экран финальной победы должен отображаться (hidden=false)');

    // 6. Click restart -> Restart at stage 1
    execSync('playwright-cli click "#restart-btn"', { encoding: 'utf-8', timeout: 5000 });
    const restartState = execSync(
      `playwright-cli eval "() => document.getElementById('current-stage-display').textContent + '|' + document.getElementById('player-x-display').textContent"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    assert.ok(restartState.includes('1|20'), `После перезапуска игра должна вернуться к Этапу 1 (X=20), получено: ${restartState}`);
  } finally {
    try {
      execSync('playwright-cli close', { encoding: 'utf-8' });
    } catch {
      // ignore
    }
  }
});
