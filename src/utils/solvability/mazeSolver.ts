import type { MazeLevelData, Point, SolvabilityReport } from './types.ts';

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

  const isInside = (p: Point) => p.y >= 0 && p.y < rows && p.x >= 0 && p.x < cols;
  const isWalkable = (p: Point) => isInside(p) && grid[p.y][p.x] === 0;

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
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const queue: Point[] = [{ x: level.start.x, y: level.start.y }];
  visited[level.start.y][level.start.x] = true;

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
      const next = { x: current.x + d.x, y: current.y + d.y };
      if (isWalkable(next) && !visited[next.y][next.x]) {
        visited[next.y][next.x] = true;
        queue.push(next);
      }
    }
  }

  // 3. Check exit reachability
  let exitReachable = true;
  if (level.exit) {
    if (!visited[level.exit.y][level.exit.x]) {
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
    } else if (!visited[item.y][item.x]) {
      errors.push(
        `Обязательный предмет #${i + 1} в клетке (${item.x}, ${item.y}) недостижим: он заблокирован стенами.`
      );
    } else {
      collectiblesReachable++;
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

  const isInside = (p: Point) => p.y >= 0 && p.y < rows && p.x >= 0 && p.x < cols;

  // Fix start if walled
  if (level.start && isInside(level.start) && grid[level.start.y][level.start.x] !== 0) {
    grid[level.start.y][level.start.x] = 0;
    changesMade.push(`Освобождена стартовая клетка (${level.start.x}, ${level.start.y}) от стены.`);
  }

  // Function to carve a corridor between two points
  function carveCorridor(from: Point, to: Point) {
    let curX = from.x;
    let curY = from.y;

    while (curX !== to.x) {
      grid[curY][curX] = 0;
      curX += curX < to.x ? 1 : -1;
    }
    while (curY !== to.y) {
      grid[curY][curX] = 0;
      curY += curY < to.y ? 1 : -1;
    }
    grid[to.y][to.x] = 0;
  }

  // Helper to get all reachable cells from start
  function getReachableCells(): Point[] {
    const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    const reachable: Point[] = [];
    if (!isInside(level.start)) return reachable;

    const queue: Point[] = [{ x: level.start.x, y: level.start.y }];
    visited[level.start.y][level.start.x] = true;

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
        if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx] === 0 && !visited[ny][nx]) {
          visited[ny][nx] = true;
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return reachable;
  }

  // Fix exit if not reachable
  if (level.exit && isInside(level.exit)) {
    const reachable = getReachableCells();
    const isExitReachable = reachable.some((p) => p.x === level.exit!.x && p.y === level.exit!.y);

    if (!isExitReachable) {
      // Find closest reachable point to exit
      let closest = level.start;
      let minDist = Infinity;
      for (const p of reachable) {
        const d = Math.abs(p.x - level.exit.x) + Math.abs(p.y - level.exit.y);
        if (d < minDist) {
          minDist = d;
          closest = p;
        }
      }
      carveCorridor(closest, level.exit);
      changesMade.push(`Прорублен коридор к финишу от клетки (${closest.x}, ${closest.y}) к (${level.exit.x}, ${level.exit.y}).`);
    }
  }

  // Fix collectibles
  if (level.collectibles && level.collectibles.length > 0) {
    for (let i = 0; i < level.collectibles.length; i++) {
      const item = level.collectibles[i];
      if (!isInside(item)) continue;

      const reachable = getReachableCells();
      const isItemReachable = reachable.some((p) => p.x === item.x && p.y === item.y);

      if (!isItemReachable) {
        let closest = level.start;
        let minDist = Infinity;
        for (const p of reachable) {
          const d = Math.abs(p.x - item.x) + Math.abs(p.y - item.y);
          if (d < minDist) {
            minDist = d;
            closest = p;
          }
        }
        carveCorridor(closest, item);
        changesMade.push(`Прорублен проход к предмету #${i + 1} в клетке (${item.x}, ${item.y}).`);
      }
    }
  }

  const fixedData: MazeLevelData = {
    ...level,
    grid,
  };

  return { fixedData, changesMade };
}
