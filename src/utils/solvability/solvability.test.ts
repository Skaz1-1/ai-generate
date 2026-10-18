import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMazeSolvability, autoFixMaze } from './mazeSolver.ts';
import { verifyPlatformerSolvability, autoFixPlatformer, calculateJumpPhysics } from './platformerSolver.ts';
import { verifyAndFixGame } from './gameVerifier.ts';
import type { MazeLevelData, PlatformerLevelData } from './types.ts';

// ------------------- MAZE TESTS -------------------

test('Maze Solver: Passable maze passes verification', () => {
  const level: MazeLevelData = {
    genre: 'maze',
    grid: [
      [0, 0, 0, 0],
      [1, 1, 0, 1],
      [0, 0, 0, 0],
      [0, 1, 1, 0],
    ],
    start: { x: 0, y: 0 },
    exit: { x: 3, y: 3 },
    collectibles: [{ x: 2, y: 0 }, { x: 0, y: 2 }],
  };

  const report = verifyMazeSolvability(level);
  assert.equal(report.passed, true);
  assert.equal(report.errors.length, 0);
  assert.equal(report.details?.exitReachable, true);
  assert.equal(report.details?.collectiblesReachable, 2);
});

test('Maze Solver: Blocked exit is detected and automatically fixed', () => {
  const level: MazeLevelData = {
    genre: 'maze',
    grid: [
      [0, 0, 1, 1],
      [1, 0, 1, 1],
      [1, 0, 1, 0], // (3, 2) is completely surrounded by walls
      [1, 1, 1, 1],
    ],
    start: { x: 0, y: 0 },
    exit: { x: 3, y: 2 },
  };

  const initialReport = verifyMazeSolvability(level);
  assert.equal(initialReport.passed, false);
  assert.ok(initialReport.errors.some((e) => e.includes('Нет проходимого пути') || e.includes('перекрывают выход')));

  // Auto-fix
  const { fixedData, changesMade } = autoFixMaze(level);
  assert.ok(changesMade.length > 0);

  const fixedReport = verifyMazeSolvability(fixedData);
  assert.equal(fixedReport.passed, true);
  assert.equal(fixedReport.details?.exitReachable, true);
});

test('Maze Solver: Unreachable collectible coin is detected and fixed', () => {
  const level: MazeLevelData = {
    genre: 'maze',
    grid: [
      [0, 0, 0, 1, 0], // (4, 0) is walled off
      [0, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
    ],
    start: { x: 0, y: 0 },
    exit: { x: 4, y: 2 },
    collectibles: [{ x: 4, y: 0 }], // isolated coin
  };

  const initialReport = verifyMazeSolvability(level);
  assert.equal(initialReport.passed, false);
  assert.ok(initialReport.errors.some((e) => e.includes('недостижим')));

  // Auto-fix
  const { fixedData, changesMade } = autoFixMaze(level);
  assert.ok(changesMade.length > 0);

  const fixedReport = verifyMazeSolvability(fixedData);
  assert.equal(fixedReport.passed, true);
  assert.equal(fixedReport.details?.collectiblesReachable, 1);
});

test('Maze Solver: Solid impassable wall across map is detected and carved', () => {
  const level: MazeLevelData = {
    genre: 'maze',
    grid: [
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0], // Complete vertical barrier at x=2
      [0, 0, 1, 0, 0],
    ],
    start: { x: 0, y: 0 },
    exit: { x: 4, y: 3 },
  };

  const initialReport = verifyMazeSolvability(level);
  assert.equal(initialReport.passed, false);

  const { fixedData } = autoFixMaze(level);
  const fixedReport = verifyMazeSolvability(fixedData);
  assert.equal(fixedReport.passed, true);
});

// ------------------- PLATFORMER TESTS -------------------

test('Platformer Solver: Computes physics parameters accurately', () => {
  // gravity = 0.5, jumpForce = 10, speed = 4
  const { maxJumpHeight, maxFlatJumpDistance } = calculateJumpPhysics(0.5, 10, 4);
  assert.equal(maxJumpHeight, 100);
  assert.equal(maxFlatJumpDistance, 160);
});

test('Platformer Solver: Passable jump sequence passes verification', () => {
  const level: PlatformerLevelData = {
    genre: 'platformer',
    physics: { gravity: 0.5, jumpForce: 10, speed: 4 }, // maxJumpHeight = 100, maxJumpDist = 160
    start: { x: 50, y: 350 },
    platforms: [
      { x: 20, y: 400, w: 100, h: 20 },
      { x: 160, y: 340, w: 100, h: 20 }, // climb = 60px (< 100px), gap = 40px (< 160px)
      { x: 300, y: 280, w: 100, h: 20 }, // climb = 60px
    ],
    exit: { x: 340, y: 260 },
  };

  const report = verifyPlatformerSolvability(level);
  assert.equal(report.passed, true);
  assert.equal(report.details?.exitReachable, true);
});

test('Platformer Solver: Platform higher than max jump height is detected and fixed', () => {
  const level: PlatformerLevelData = {
    genre: 'platformer',
    physics: { gravity: 0.5, jumpForce: 10, speed: 4 }, // maxJumpHeight = 100px
    start: { x: 50, y: 350 },
    platforms: [
      { x: 20, y: 400, w: 100, h: 20 },
      { x: 140, y: 220, w: 100, h: 20 }, // climb = 180px > 100px! IMPOSSIBLE TO JUMP
    ],
    exit: { x: 180, y: 200 },
  };

  const initialReport = verifyPlatformerSolvability(level);
  assert.equal(initialReport.passed, false);
  assert.ok(initialReport.errors.some((e) => e.includes('физически недостижим')));

  // Auto-fix
  const { fixedData, changesMade } = autoFixPlatformer(level);
  assert.ok(changesMade.length > 0);

  const fixedReport = verifyPlatformerSolvability(fixedData);
  assert.equal(fixedReport.passed, true);
});

test('Platformer Solver: Chasm wider than jump distance is bridged by stepping platform', () => {
  const level: PlatformerLevelData = {
    genre: 'platformer',
    physics: { gravity: 0.5, jumpForce: 10, speed: 4 }, // maxJumpDist = 160px
    start: { x: 50, y: 350 },
    platforms: [
      { x: 0, y: 400, w: 80, h: 20 },
      { x: 350, y: 400, w: 80, h: 20 }, // gap = 270px > 160px! IMPOSSIBLE GAP
    ],
    exit: { x: 380, y: 380 },
  };

  const initialReport = verifyPlatformerSolvability(level);
  assert.equal(initialReport.passed, false);

  const { fixedData, changesMade } = autoFixPlatformer(level);
  assert.ok(changesMade.length > 0);
  assert.ok(fixedData.platforms.length > 2); // stepping platform added

  const fixedReport = verifyPlatformerSolvability(fixedData);
  assert.equal(fixedReport.passed, true);
});

test('Platformer Solver: Unreachable floating item is lowered into jump range', () => {
  const level: PlatformerLevelData = {
    genre: 'platformer',
    physics: { gravity: 0.5, jumpForce: 10, speed: 4 }, // maxJumpHeight = 100px
    start: { x: 50, y: 350 },
    platforms: [
      { x: 20, y: 400, w: 200, h: 20 },
    ],
    collectibles: [
      { x: 80, y: 150 }, // 250px above platform! max jump is 100px
    ],
  };

  const initialReport = verifyPlatformerSolvability(level);
  assert.equal(initialReport.passed, false);
  assert.ok(initialReport.errors.some((e) => e.includes('недостижим')));

  const { fixedData } = autoFixPlatformer(level);
  const fixedReport = verifyPlatformerSolvability(fixedData);
  assert.equal(fixedReport.passed, true);
  assert.equal(fixedReport.details?.collectiblesReachable, 1);
});

// ------------------- MASTER HTML INTEGRATION -------------------

test('Master Verifier: Injects and fixes embedded HTML level data', () => {
  const sampleHtml = `<!DOCTYPE html>
  <html>
  <head><title>Test Maze</title></head>
  <body>
    <script>
      window.GAME_LEVEL_DATA = {
        genre: "maze",
        grid: [
          [0, 1, 1],
          [1, 1, 1],
          [1, 1, 0]
        ],
        start: { x: 0, y: 0 },
        exit: { x: 2, y: 2 }
      };
      console.log('Game initialized');
    </script>
  </body>
  </html>`;

  const result = verifyAndFixGame(sampleHtml);
  assert.equal(result.wasFixed, true);
  assert.equal(result.report.passed, true);
  assert.ok(result.html.includes('window.GAME_LEVEL_DATA'));
});
