import type { MazeLevelData, Point, SolvabilityReport } from './types.ts';

/**
 * Normalizes any continuous / floating point coordinates (e.g. { x: 1.5, y: 1.5 })
 * into integer grid cell indices (e.g. { x: 1, y: 1 }).
 */
function toCell(p: Point): Point {
  return {
    x: Math.floor(Number(p.x)),
    y: Math.floor(Number(p.y)),
  };
}

/**
 * Validates whether a maze level is solvable:
 * 1. Start position is valid and walkable.
 * 2. Exit position (if present) is reachable from start.
 * 3. All required collectibles are reachable from start.
 * 4. Path is not blocked by impassable solid walls.
 */
export function verifyMazeSolvability(level: MazeLevelData): SolvabilityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const grid = level.grid;

  if (!grid || !Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
    return {
      passed: false,
      genre: 'maze',
      errors: ['Сетка лабиринта отсутствует или повреждена.'],
      warnings,
    };
  }

  const rows = grid.length;
  const cols = grid[0].length;

  const isInside = (p: Point) => {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || isNaN(p.x) || isNaN(p.y)) {
      return false;
    }
    const c = toCell(p);
    return c.y >= 0 && c.y < rows && c.x >= 0 && c.x < cols;
  };

  const isWalkable = (p: Point) => {
    if (!isInside(p)) return false;
    const c = toCell(p);
    return Array.isArray(grid[c.y]) && grid[c.y][c.x] === 0;
  };

  // 1. Check start
  if (!level.start || !isInside(level.start)) {
    errors.push('Стартовая позиция персонажа находится вне пределов карты.');
  } else if (!isWalkable(level.start)) {
    errors.push('Стартовая позиция персонажа заблокирована стеной.');
  }

  // 2. Check exit bounds
  if (level.exit && !isInside(level.exit)) {
    errors.push('Точка финиша находится вне пределов карты.');
  } else if (level.exit && !isWalkable(level.exit)) {
    errors.push('Точка финиша заблокирована непроходимой стеной.');
  }

  if (errors.length > 0) {
    return {
      passed: false,
      genre: 'maze',
      errors,
      warnings,
    };
  }

  // BFS from start to find all reachable cells
  const startCell = toCell(level.start);
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const queue: Point[] = [startCell];
  visited[startCell.y][startCell.x] = true;

  const dirs = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  let reachableCount = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    reachableCount++;

    for (const d of dirs) {
      const nextCell = { x: current.x + d.x, y: current.y + d.y };
      if (isWalkable(nextCell) && !visited[nextCell.y][nextCell.x]) {
        visited[nextCell.y][nextCell.x] = true;
        queue.push(nextCell);
      }
    }
  }

  // 3. Check exit reachability
  let exitReachable = true;
  if (level.exit) {
    const exitCell = toCell(level.exit);
    if (!visited[exitCell.y][exitCell.x]) {
      exitReachable = false;
      errors.push(
        `Нет проходимого пути от старта (${level.start.x}, ${level.start.y}) к финишу (${level.exit.x}, ${level.exit.y}). Стены полностью перекрывают выход.`
      );
    }
  }

  // 4. Check collectibles reachability
  const collectibles = level.collectibles || [];
  let collectiblesReachable = 0;
  for (let i = 0; i < collectibles.length; i++) {
    const item = collectibles[i];
    if (!isInside(item)) {
      errors.push(`Обязательный предмет #${i + 1} находится за пределами карты.`);
    } else {
      const itemCell = toCell(item);
      if (!visited[itemCell.y][itemCell.x]) {
        errors.push(
          `Обязательный предмет #${i + 1} в клетке (${item.x}, ${item.y}) недостижим: он заблокирован стенами.`
        );
      } else {
        collectiblesReachable++;
      }
    }
  }

  const passed = errors.length === 0;

  return {
    passed,
    genre: 'maze',
    errors,
    warnings,
    details: {
      collectiblesTotal: collectibles.length,
      collectiblesReachable,
      exitReachable,
    },
  };
}

/**
 * Automatically fixes maze connectivity:
 * - Carves open path to exit if blocked.
 * - Carves open path to unreachable collectibles.
 * - Guarantees 100% path existence.
 */
export function autoFixMaze(level: MazeLevelData): { fixedData: MazeLevelData; changesMade: string[] } {
  const changesMade: string[] = [];
  const grid = level.grid.map((row) => [...row]);
  const rows = grid.length;
  const cols = grid[0].length;

  const isInside = (p: Point) => {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || isNaN(p.x) || isNaN(p.y)) {
      return false;
    }
    const c = toCell(p);
    return c.y >= 0 && c.y < rows && c.x >= 0 && c.x < cols;
  };

  // Fix start if walled
  if (level.start && isInside(level.start)) {
    const sc = toCell(level.start);
    if (grid[sc.y] && grid[sc.y][sc.x] !== 0) {
      grid[sc.y][sc.x] = 0;
      changesMade.push(`Освобождена стартовая клетка (${level.start.x}, ${level.start.y}) от стены.`);
    }
  }

  // Function to carve a corridor between two points
  function carveCorridor(from: Point, to: Point) {
    const fc = toCell(from);
    const tc = toCell(to);
    let curX = fc.x;
    let curY = fc.y;

    while (curX !== tc.x) {
      if (grid[curY]) grid[curY][curX] = 0;
      curX += curX < tc.x ? 1 : -1;
    }
    while (curY !== tc.y) {
      if (grid[curY]) grid[curY][curX] = 0;
      curY += curY < tc.y ? 1 : -1;
    }
    if (grid[tc.y]) grid[tc.y][tc.x] = 0;
  }

  // Helper to get all reachable cells from start
  function getReachableCells(): Point[] {
    const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    const reachable: Point[] = [];
    if (!isInside(level.start)) return reachable;

    const sc = toCell(level.start);
    const queue: Point[] = [sc];
    visited[sc.y][sc.x] = true;

    const dirs = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      reachable.push(cur);

      for (const d of dirs) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny] && grid[ny][nx] === 0 && !visited[ny][nx]) {
          visited[ny][nx] = true;
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return reachable;
  }

  // Fix exit if not reachable
  if (level.exit && isInside(level.exit)) {
    const ec = toCell(level.exit);
    const reachable = getReachableCells();
    const isExitReachable = reachable.some((p) => p.x === ec.x && p.y === ec.y);

    if (!isExitReachable) {
      // Find closest reachable point to exit
      let closest = toCell(level.start);
      let minDist = Infinity;
      for (const p of reachable) {
        const d = Math.abs(p.x - ec.x) + Math.abs(p.y - ec.y);
        if (d < minDist) {
          minDist = d;
          closest = p;
        }
      }
      carveCorridor(closest, ec);
      changesMade.push(`Прорублен коридор к финишу от клетки (${closest.x}, ${closest.y}) к (${ec.x}, ${ec.y}).`);
    }
  }

  // Fix collectibles
  if (level.collectibles && level.collectibles.length > 0) {
    for (let i = 0; i < level.collectibles.length; i++) {
      const item = level.collectibles[i];
      if (!isInside(item)) continue;

      const ic = toCell(item);
      const reachable = getReachableCells();
      const isItemReachable = reachable.some((p) => p.x === ic.x && p.y === ic.y);

      if (!isItemReachable) {
        let closest = toCell(level.start);
        let minDist = Infinity;
        for (const p of reachable) {
          const d = Math.abs(p.x - ic.x) + Math.abs(p.y - ic.y);
          if (d < minDist) {
            minDist = d;
            closest = p;
          }
        }
        carveCorridor(closest, ic);
        changesMade.push(`Прорублен проход к предмету #${i + 1} в клетке (${ic.x}, ${ic.y}).`);
      }
    }
  }

  const fixedData: MazeLevelData = {
    ...level,
    grid,
  };

  return { fixedData, changesMade };
}
