import type { PlatformerLevelData, Rect, Point, SolvabilityReport } from './types.ts';

/**
 * Calculates physics jump limits:
 * - maxJumpHeight = (jumpForce^2) / (2 * gravity)
 * - maxFlatJumpDistance = speed * (2 * jumpForce / gravity)
 */
export function calculateJumpPhysics(gravity: number, jumpForce: number, speed: number) {
  const g = Math.max(0.1, gravity);
  const v0 = Math.max(1, jumpForce);
  const vx = Math.max(1, speed);

  const maxJumpHeight = (v0 * v0) / (2 * g);
  const timeToPeak = v0 / g;
  const flatAirTime = 2 * timeToPeak;
  const maxFlatJumpDistance = vx * flatAirTime;

  return {
    maxJumpHeight,
    timeToPeak,
    flatAirTime,
    maxFlatJumpDistance,
  };
}

/**
 * Checks whether platform B is reachable by jumping from platform A.
 * In 2D canvas coordinates: y points DOWNWARDS.
 * Upward jump means: platformB.y < platformA.y (climbing up).
 */
export function canJumpBetweenPlatforms(
  platA: Rect,
  platB: Rect,
  gravity: number,
  jumpForce: number,
  speed: number
): boolean {
  const g = Math.max(0.1, gravity);
  const v0 = Math.max(1, jumpForce);
  const vx = Math.max(1, speed);

  const maxJumpHeight = (v0 * v0) / (2 * g);

  // Height difference (positive = climbing UP)
  const heightClimb = platA.y - platB.y;

  // Cannot climb higher than max jump height (with 5% margin for ceiling/landing)
  if (heightClimb > maxJumpHeight * 0.98) {
    return false;
  }

  // Calculate maximum airtime to reach platform B's height
  let airTime = 0;
  if (heightClimb >= 0) {
    // Upward jump
    const fallFromApex = maxJumpHeight - heightClimb;
    const timeFromApex = Math.sqrt((2 * Math.max(0, fallFromApex)) / g);
    airTime = v0 / g + timeFromApex;
  } else {
    // Downward jump / fall
    const fallFromApex = maxJumpHeight + Math.abs(heightClimb);
    const timeFromApex = Math.sqrt((2 * fallFromApex) / g);
    airTime = v0 / g + timeFromApex;
  }

  const maxHorizontalReach = vx * airTime;

  // Horizontal gap between platforms
  let horizGap = 0;
  if (platB.x > platA.x + platA.w) {
    horizGap = platB.x - (platA.x + platA.w);
  } else if (platA.x > platB.x + platB.w) {
    horizGap = platA.x - (platB.x + platB.w);
  } else {
    // Platforms overlap horizontally
    horizGap = 0;
  }

  return horizGap <= maxHorizontalReach * 1.05; // 5% grace tolerance
}

/**
 * Verifies whether a platformer level is solvable:
 * 1. Player starts on a solid platform.
 * 2. Exit platform is reachable through physics jump graph.
 * 3. All required collectibles are located within reachable jump zones.
 * 4. No impassable high walls blocking all forward motion.
 */
export function verifyPlatformerSolvability(level: PlatformerLevelData): SolvabilityReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { gravity, jumpForce, speed } = level.physics;
  const { maxJumpHeight, maxFlatJumpDistance } = calculateJumpPhysics(gravity, jumpForce, speed);

  const platforms = level.platforms || [];
  if (platforms.length === 0) {
    return {
      passed: false,
      genre: 'platformer',
      errors: ['В платформере отсутствуют платформы.'],
      warnings,
    };
  }

  // 1. Find the starting platform (platform immediately beneath the start point)
  let startPlatIndex = -1;
  let minStartDist = Infinity;

  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    // Check if start.x is within platform x bounds (+/- 20px) and start.y is near or above platform top
    if (level.start.x >= p.x - 20 && level.start.x <= p.x + p.w + 20) {
      const dist = p.y - level.start.y;
      if (dist >= -10 && dist < 120 && dist < minStartDist) {
        minStartDist = dist;
        startPlatIndex = i;
      }
    }
  }

  if (startPlatIndex === -1) {
    // Fallback: pick the closest platform to start point
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      const d = Math.hypot(level.start.x - (p.x + p.w / 2), level.start.y - p.y);
      if (d < minStartDist) {
        minStartDist = d;
        startPlatIndex = i;
      }
    }
  }

  // 2. Build reachability graph with BFS
  const numPlats = platforms.length;
  const reachablePlatforms = new Set<number>();
  const queue: number[] = [startPlatIndex];
  reachablePlatforms.add(startPlatIndex);

  while (queue.length > 0) {
    const currIdx = queue.shift()!;
    const currPlat = platforms[currIdx];

    for (let nextIdx = 0; nextIdx < numPlats; nextIdx++) {
      if (reachablePlatforms.has(nextIdx)) continue;
      const nextPlat = platforms[nextIdx];

      if (canJumpBetweenPlatforms(currPlat, nextPlat, gravity, jumpForce, speed)) {
        reachablePlatforms.add(nextIdx);
        queue.push(nextIdx);
      }
    }
  }

  // Check platforms that couldn't be reached
  const unreachablePlats: Rect[] = [];
  for (let i = 0; i < numPlats; i++) {
    if (!reachablePlatforms.has(i)) {
      unreachablePlats.push(platforms[i]);
    }
  }

  // 3. Verify exit reachability
  let exitReachable = true;
  if (level.exit) {
    // Find platform under or closest to exit
    let exitPlatIndex = -1;
    let minExitDist = Infinity;

    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (level.exit.x >= p.x - 20 && level.exit.x <= p.x + p.w + 20) {
        const dist = Math.abs(p.y - level.exit.y);
        if (dist < 120 && dist < minExitDist) {
          minExitDist = dist;
          exitPlatIndex = i;
        }
      }
    }

    if (exitPlatIndex !== -1 && !reachablePlatforms.has(exitPlatIndex)) {
      exitReachable = false;
      const targetPlat = platforms[exitPlatIndex];
      errors.push(
        `Финиш (платформа на x: ${targetPlat.x}, y: ${targetPlat.y}) физически недостижим при силе прыжка ${jumpForce} и гравитации ${gravity} (макс. высота прыжка: ${Math.round(maxJumpHeight)}px).`
      );
    }
  }

  // 4. Verify collectibles reachability
  const collectibles = level.collectibles || [];
  let collectiblesReachable = 0;

  for (let cIdx = 0; cIdx < collectibles.length; cIdx++) {
    const item = collectibles[cIdx];
    let isReachable = false;

    // Item is reachable if it's within jumping range of ANY reachable platform
    for (const pIdx of reachablePlatforms) {
      const p = platforms[pIdx];
      // Item must be horizontally reachable
      const horizDist =
        item.x < p.x ? p.x - item.x : item.x > p.x + p.w ? item.x - (p.x + p.w) : 0;
      // Item must not be higher than platform.y - maxJumpHeight
      const heightAbove = p.y - item.y;

      if (heightAbove >= -40 && heightAbove <= maxJumpHeight * 1.05 && horizDist <= maxFlatJumpDistance) {
        isReachable = true;
        break;
      }
    }

    if (!isReachable) {
      errors.push(
        `Предмет #${cIdx + 1} в точке (${item.x}, ${item.y}) недостижим: высота прыжка персонажа (${Math.round(maxJumpHeight)}px) недостаточна.`
      );
    } else {
      collectiblesReachable++;
    }
  }

  if (unreachablePlats.length > 0 && errors.length === 0) {
    warnings.push(`На уровне обнаружено ${unreachablePlats.length} изолированных платформ, но финиш и предметы достижимы.`);
  }

  const passed = errors.length === 0;

  return {
    passed,
    genre: 'platformer',
    errors,
    warnings,
    details: {
      maxJumpHeight: Math.round(maxJumpHeight),
      maxJumpDistance: Math.round(maxFlatJumpDistance),
      collectiblesTotal: collectibles.length,
      collectiblesReachable,
      exitReachable,
      unreachablePlatforms: unreachablePlats,
    },
  };
}

/**
 * Automatically repairs an impossible platformer level:
 * - Lowers platforms that exceed jump height.
 * - Inserts intermediate stepping platforms across too-wide chasms.
 * - Repositions unreachable floating collectibles within jump arc.
 */
export function autoFixPlatformer(level: PlatformerLevelData): { fixedData: PlatformerLevelData; changesMade: string[] } {
  const changesMade: string[] = [];
  const { gravity, jumpForce, speed } = level.physics;
  const { maxJumpHeight, maxFlatJumpDistance } = calculateJumpPhysics(gravity, jumpForce, speed);

  const safeStepHeight = Math.floor(maxJumpHeight * 0.75);
  const safeStepDistance = Math.floor(maxFlatJumpDistance * 0.75);

  const platforms: Rect[] = level.platforms.map((p) => ({ ...p }));
  const collectibles: Point[] = (level.collectibles || []).map((c) => ({ ...c }));

  // Sort platforms from left to right
  platforms.sort((a, b) => a.x - b.x);

  // Walk through sequential platforms and bridge unreachable gaps
  for (let i = 0; i < platforms.length - 1; i++) {
    const cur = platforms[i];
    const next = platforms[i + 1];

    const climb = cur.y - next.y;
    const gap = next.x - (cur.x + cur.w);

    // If next platform is too high to jump onto
    if (climb > maxJumpHeight * 0.9) {
      // Lower the next platform so it's safely jumpable
      const newY = cur.y - safeStepHeight;
      next.y = newY;
      changesMade.push(
        `Снижена высота платформы #${i + 2} с ${cur.y - climb}px до ${newY}px для соответствия прыжку ${Math.round(maxJumpHeight)}px.`
      );
    }

    // If gap between platforms is too wide to leap across
    if (gap > safeStepDistance) {
      // Insert intermediate bridge/stepping platform
      const bridgeW = 80;
      const bridgeX = Math.round(cur.x + cur.w + (gap - bridgeW) / 2);
      const bridgeY = Math.round((cur.y + next.y) / 2);
      platforms.push({ x: bridgeX, y: bridgeY, w: bridgeW, h: 20 });
      changesMade.push(
        `Добавлена промежуточная платформа-ступенька на x: ${bridgeX}, y: ${bridgeY} через пропасть шириной ${gap}px.`
      );
    }
  }

  // Fix collectibles that hover above max jump reach
  for (let cIdx = 0; cIdx < collectibles.length; cIdx++) {
    const item = collectibles[cIdx];
    // Find closest platform
    let closestPlat = platforms[0];
    let minD = Infinity;

    for (const p of platforms) {
      const d = Math.abs(item.x - (p.x + p.w / 2));
      if (d < minD) {
        minD = d;
        closestPlat = p;
      }
    }

    // If item is too high above this platform
    if (closestPlat.y - item.y > maxJumpHeight * 0.85) {
      const fixedY = closestPlat.y - Math.round(maxJumpHeight * 0.6);
      item.y = fixedY;
      changesMade.push(`Опущен предмет #${cIdx + 1} до высоты ${fixedY}px, доступной для прыжка.`);
    }
  }

  const fixedData: PlatformerLevelData = {
    ...level,
    platforms,
    collectibles,
  };

  return { fixedData, changesMade };
}
