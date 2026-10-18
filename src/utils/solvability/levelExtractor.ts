import type { MazeLevelData, PlatformerLevelData, GameGenre } from './types.ts';

/**
 * Extracts structured level data from generated HTML code.
 * Checks for window.GAME_LEVEL_DATA, const LEVEL_DATA, or fallback pattern parsing.
 */
export function extractLevelDataFromHtml(html: string): {
  genre: GameGenre;
  mazeData?: MazeLevelData;
  platformerData?: PlatformerLevelData;
  rawJsonSnippet?: string;
} {
  if (!html || typeof html !== 'string') {
    return { genre: 'other' };
  }

  // 1. Check for standard window.GAME_LEVEL_DATA = { ... };
  const standardMatch = html.match(/(?:window\.)?GAME_LEVEL_DATA\s*=\s*(\{[\s\S]*?\});/);
  if (standardMatch && standardMatch[1]) {
    try {
      // Evaluate or parse JSON object
      const parsed = parseSafeJsObject(standardMatch[1]);
      if (parsed && typeof parsed === 'object') {
        if (parsed.genre === 'maze' && Array.isArray(parsed.grid)) {
          return {
            genre: 'maze',
            mazeData: parsed as MazeLevelData,
            rawJsonSnippet: standardMatch[1],
          };
        }
        if (parsed.genre === 'platformer' && Array.isArray(parsed.platforms) && parsed.physics) {
          return {
            genre: 'platformer',
            platformerData: parsed as PlatformerLevelData,
            rawJsonSnippet: standardMatch[1],
          };
        }
      }
    } catch (e) {
      // Continue to heuristic fallbacks
    }
  }

  // 2. Heuristic fallback: detect maze 2D grid matrix
  const gridMatch = html.match(/(?:const|let|var)\s+(?:grid|maze|map)\s*=\s*(\[\s*\[[\s\S]*?\]\s*\]);/i);
  if (gridMatch && gridMatch[1]) {
    try {
      const grid = parseSafeJsObject(gridMatch[1]);
      if (Array.isArray(grid) && grid.length > 2 && Array.isArray(grid[0])) {
        // Look for start and exit coordinates
        const startXMatch = html.match(/(?:startX|playerX|player\.x)\s*[:=]\s*(\d+)/);
        const startYMatch = html.match(/(?:startY|playerY|player\.y)\s*[:=]\s*(\d+)/);
        const exitXMatch = html.match(/(?:exitX|targetX|goalX|finishX)\s*[:=]\s*(\d+)/);
        const exitYMatch = html.match(/(?:exitY|targetY|goalY|finishY)\s*[:=]\s*(\d+)/);

        const start = {
          x: startXMatch ? parseInt(startXMatch[1], 10) : 1,
          y: startYMatch ? parseInt(startYMatch[1], 10) : 1,
        };

        const exit = exitXMatch && exitYMatch ? {
          x: parseInt(exitXMatch[1], 10),
          y: parseInt(exitYMatch[1], 10),
        } : undefined;

        return {
          genre: 'maze',
          mazeData: {
            genre: 'maze',
            grid: grid as number[][],
            start,
            exit,
          },
        };
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. Heuristic fallback: detect platformer platform array
  const platMatch = html.match(/(?:const|let|var)\s+platforms\s*=\s*(\[\s*\{[\s\S]*?\}\s*\]);/i);
  if (platMatch && platMatch[1]) {
    try {
      const platforms = parseSafeJsObject(platMatch[1]);
      if (Array.isArray(platforms) && platforms.length > 0 && platforms[0].x !== undefined && platforms[0].y !== undefined) {
        // Extract physics
        const gravMatch = html.match(/gravity\s*[:=]\s*([\d.]+)/i);
        const jumpMatch = html.match(/(?:jumpForce|jumpVelocity|jumpPower|jumpSpeed)\s*[:=]\s*([\d.]+)/i);
        const speedMatch = html.match(/(?:speed|playerSpeed|moveSpeed)\s*[:=]\s*([\d.]+)/i);

        return {
          genre: 'platformer',
          platformerData: {
            genre: 'platformer',
            physics: {
              gravity: gravMatch ? parseFloat(gravMatch[1]) : 0.5,
              jumpForce: jumpMatch ? parseFloat(jumpMatch[1]) : 11,
              speed: speedMatch ? parseFloat(speedMatch[1]) : 3.5,
            },
            start: { x: platforms[0].x, y: platforms[0].y - 30 },
            platforms: platforms.map((p: any) => ({
              x: Number(p.x || 0),
              y: Number(p.y || 0),
              w: Number(p.w || p.width || 80),
              h: Number(p.h || p.height || 20),
            })),
          },
        };
      }
    } catch (e) {
      // ignore
    }
  }

  // Non-spatial / free-form game (clicker, memory cards, reaction, etc.)
  return { genre: 'other' };
}

/**
 * Replaces or injects the updated level data into the HTML code.
 */
export function replaceLevelDataInHtml(html: string, newLevelData: MazeLevelData | PlatformerLevelData): string {
  const jsonStr = JSON.stringify(newLevelData, null, 2);

  // 1. If window.GAME_LEVEL_DATA exists, replace it cleanly
  if (/(?:window\.)?GAME_LEVEL_DATA\s*=\s*\{[\s\S]*?\};/.test(html)) {
    return html.replace(
      /(?:window\.)?GAME_LEVEL_DATA\s*=\s*\{[\s\S]*?\};/,
      `window.GAME_LEVEL_DATA = ${jsonStr};`
    );
  }

  // 2. Otherwise inject window.GAME_LEVEL_DATA before the first <script> tag
  if (html.includes('<script>')) {
    return html.replace(
      '<script>',
      `<script>\nwindow.GAME_LEVEL_DATA = ${jsonStr};\n`
    );
  }

  return html;
}

/**
 * Safely parses a JS object literal or JSON string without external eval.
 */
function parseSafeJsObject(str: string): any {
  // Try direct JSON.parse first
  try {
    return JSON.parse(str);
  } catch (e) {
    // Convert unquoted keys: { key: 1 } -> { "key": 1 }
    const jsonFormatted = str
      .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(jsonFormatted);
  }
}
