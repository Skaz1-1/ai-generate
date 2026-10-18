/**
 * Default starter HTML5 game for initial preview before user's first prompt.
 * 100% self-contained, responsive, with touch and keyboard controls.
 */
export const STARTER_GAME_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Билайн Пакман: Сбор сот</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    body {
      background: #0d0f12;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
      padding: 10px;
    }
    #game-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 480px;
      width: 100%;
    }
    .hud {
      display: flex;
      justify-content: space-between;
      width: 100%;
      padding: 8px 14px;
      background: #171920;
      border-radius: 12px;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: bold;
      border: 1px solid #282c37;
    }
    .score-val { color: #ffbe00; }
    .lives-val { color: #ff4757; }
    canvas {
      background: #000;
      border: 2px solid #ffbe00;
      border-radius: 12px;
      display: block;
      box-shadow: 0 8px 24px rgba(255, 190, 0, 0.15);
      touch-action: none;
      max-width: 100%;
    }
    /* Touch controls */
    .controls {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      width: 180px;
      margin-top: 10px;
    }
    .btn-ctrl {
      background: #202430;
      color: #ffbe00;
      border: 1px solid #ffbe00;
      font-size: 18px;
      font-weight: bold;
      border-radius: 10px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.4);
    }
    .btn-ctrl:active {
      background: #ffbe00;
      color: #000;
      transform: scale(0.95);
    }
    /* Overlay screens */
    .overlay {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(13, 15, 18, 0.94);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      z-index: 10;
    }
    .overlay h2 {
      font-size: 24px;
      color: #ffbe00;
      margin-bottom: 10px;
      font-weight: 800;
    }
    .overlay p {
      font-size: 13px;
      color: #ccc;
      margin-bottom: 20px;
      line-height: 1.5;
    }
    .btn-main {
      background: #ffbe00;
      color: #000;
      border: none;
      font-size: 16px;
      font-weight: 800;
      padding: 12px 28px;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(255, 190, 0, 0.4);
      transition: transform 0.1s;
    }
    .btn-main:active { transform: scale(0.96); }
  </style>
</head>
<body>
  <div id="game-container">
    <div class="hud">
      <div>Счёт: <span id="score" class="score-val">0</span> / 20</div>
      <div>Жизни: <span id="lives" class="lives-val">❤️❤️❤️</span></div>
    </div>
    
    <div style="position: relative; width: 100%; display: flex; justify-content: center;">
      <canvas id="gameCanvas" width="360" height="360"></canvas>
      
      <!-- Start screen -->
      <div id="startScreen" class="overlay">
        <h2>Билайн Пакман</h2>
        <p>Собери все 20 жёлтых сот и не попадись серым тучам!<br>Управление: стрелки, WASD или сенсорные кнопки внизу.</p>
        <button id="startBtn" class="btn-main">Играть</button>
      </div>

      <!-- Game over screen -->
      <div id="gameOverScreen" class="overlay" style="display: none;">
        <h2 id="endTitle">Поражение</h2>
        <p id="endDesc">Собрано сот: 0</p>
        <button id="restartBtn" class="btn-main">Играть снова</button>
      </div>
    </div>

    <!-- On-screen touch buttons for mobile -->
    <div class="controls">
      <div></div>
      <button class="btn-ctrl" id="upBtn">▲</button>
      <div></div>
      <button class="btn-ctrl" id="leftBtn">◀</button>
      <button class="btn-ctrl" id="downBtn">▼</button>
      <button class="btn-ctrl" id="rightBtn">▶</button>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const startScreen = document.getElementById('startScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const endTitle = document.getElementById('endTitle');
    const endDesc = document.getElementById('endDesc');

    let isPlaying = false;
    let score = 0;
    let lives = 3;
    let animId = null;

    // Player (Pacman)
    const player = {
      x: 180,
      y: 180,
      radius: 14,
      speed: 3,
      dx: 0,
      dy: 0,
      mouthAngle: 0.2,
      mouthSpeed: 0.04,
      angle: 0
    };

    // Honeycombs to collect
    let items = [];
    const TOTAL_ITEMS = 20;

    function initItems() {
      items = [];
      for (let i = 0; i < TOTAL_ITEMS; i++) {
        items.push({
          x: 25 + Math.random() * (canvas.width - 50),
          y: 25 + Math.random() * (canvas.height - 50),
          radius: 6,
          collected: false
        });
      }
    }

    // Enemies (Cloud ghosts)
    let enemies = [];
    function initEnemies() {
      enemies = [
        { x: 40, y: 40, speed: 1.8, dx: 1.8, dy: 1.2, radius: 13, color: '#718096' },
        { x: 320, y: 320, speed: 2.1, dx: -1.5, dy: 1.8, radius: 13, color: '#4a5568' }
      ];
    }

    function startGame() {
      score = 0;
      lives = 3;
      player.x = 180;
      player.y = 180;
      player.dx = 0;
      player.dy = 0;
      updateHud();
      initItems();
      initEnemies();
      startScreen.style.display = 'none';
      gameOverScreen.style.display = 'none';
      isPlaying = true;
      if (animId) cancelAnimationFrame(animId);
      loop();
    }

    function updateHud() {
      scoreEl.textContent = score;
      livesEl.textContent = '❤️'.repeat(lives) || '💀';
    }

    function endGame(isWin) {
      isPlaying = false;
      if (animId) cancelAnimationFrame(animId);
      endTitle.textContent = isWin ? 'Победа! 🎉' : 'Игра окончена';
      endTitle.style.color = isWin ? '#ffbe00' : '#ff4757';
      endDesc.textContent = isWin ? 'Вы собрали все 20 сот Билайна!' : 'Собрано сот: ' + score + ' из 20';
      gameOverScreen.style.display = 'flex';
    }

    // Input handlers
    function setDirection(dx, dy) {
      if (!isPlaying) return;
      player.dx = dx * player.speed;
      player.dy = dy * player.speed;
      if (dx === 1) player.angle = 0;
      if (dx === -1) player.angle = Math.PI;
      if (dy === 1) player.angle = Math.PI / 2;
      if (dy === -1) player.angle = -Math.PI / 2;
    }

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) { setDirection(0, -1); e.preventDefault(); }
      if (['ArrowDown', 'KeyS'].includes(e.code)) { setDirection(0, 1); e.preventDefault(); }
      if (['ArrowLeft', 'KeyA'].includes(e.code)) { setDirection(-1, 0); e.preventDefault(); }
      if (['ArrowRight', 'KeyD'].includes(e.code)) { setDirection(1, 0); e.preventDefault(); }
    });

    document.getElementById('upBtn').onclick = () => setDirection(0, -1);
    document.getElementById('downBtn').onclick = () => setDirection(0, 1);
    document.getElementById('leftBtn').onclick = () => setDirection(-1, 0);
    document.getElementById('rightBtn').onclick = () => setDirection(1, 0);

    document.getElementById('startBtn').onclick = startGame;
    document.getElementById('restartBtn').onclick = startGame;

    function loop() {
      if (!isPlaying) return;

      // Update player
      player.x += player.dx;
      player.y += player.dy;

      // Wall boundaries
      if (player.x - player.radius < 0) player.x = player.radius;
      if (player.x + player.radius > canvas.width) player.x = canvas.width - player.radius;
      if (player.y - player.radius < 0) player.y = player.radius;
      if (player.y + player.radius > canvas.height) player.y = canvas.height - player.radius;

      // Animate mouth
      player.mouthAngle += player.mouthSpeed;
      if (player.mouthAngle > 0.4 || player.mouthAngle < 0.05) {
        player.mouthSpeed = -player.mouthSpeed;
      }

      // Check item collisions
      for (const item of items) {
        if (!item.collected) {
          const dist = Math.hypot(player.x - item.x, player.y - item.y);
          if (dist < player.radius + item.radius) {
            item.collected = true;
            score++;
            updateHud();
            if (score >= TOTAL_ITEMS) {
              endGame(true);
              return;
            }
          }
        }
      }

      // Update enemies
      for (const enemy of enemies) {
        enemy.x += enemy.dx;
        enemy.y += enemy.dy;
        if (enemy.x - enemy.radius < 0 || enemy.x + enemy.radius > canvas.width) enemy.dx *= -1;
        if (enemy.y - enemy.radius < 0 || enemy.y + enemy.radius > canvas.height) enemy.dy *= -1;

        // Collision with player
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < player.radius + enemy.radius) {
          lives--;
          updateHud();
          player.x = 180;
          player.y = 180;
          player.dx = 0;
          player.dy = 0;
          if (lives <= 0) {
            endGame(false);
            return;
          }
        }
      }

      // Draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Grid background
      ctx.strokeStyle = '#151922';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Draw honeycombs
      for (const item of items) {
        if (!item.collected) {
          ctx.save();
          ctx.translate(item.x, item.y);
          ctx.fillStyle = '#ffbe00';
          ctx.beginPath();
          for (let a = 0; a < 6; a++) {
            const angle = (a * Math.PI) / 3;
            const px = item.radius * Math.cos(angle);
            const py = item.radius * Math.sin(angle);
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // Draw enemies (Clouds)
      for (const enemy of enemies) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-4, -2, 3, 0, Math.PI * 2);
        ctx.arc(4, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-4, -2, 1.5, 0, Math.PI * 2);
        ctx.arc(4, -2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Player (Pacman)
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      ctx.fillStyle = '#ffbe00';
      ctx.beginPath();
      ctx.arc(0, 0, player.radius, player.mouthAngle, Math.PI * 2 - player.mouthAngle);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      // Eye
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(2, -player.radius * 0.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      animId = requestAnimationFrame(loop);
    }
  </script>
</body>
</html>`;
