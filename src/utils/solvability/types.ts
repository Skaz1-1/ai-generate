export const SOLVABILITY_MODULE = true;

export type GameGenre = 'maze' | 'platformer' | 'collector' | 'other';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MazeLevelData {
  genre: 'maze';
  grid: number[][]; // 0 = empty/walkable, 1 = wall
  start: Point;
  exit?: Point;
  collectibles?: Point[];
  cellSize?: number;
}

export interface PlatformerPhysics {
  gravity: number; // pixels / frame^2 (e.g. 0.5)
  jumpForce: number; // initial upward velocity (e.g. 10 or 12)
  speed: number; // horizontal speed (e.g. 4)
  playerWidth?: number;
  playerHeight?: number;
}

export interface PlatformerLevelData {
  genre: 'platformer';
  physics: PlatformerPhysics;
  start: Point;
  exit?: Point;
  platforms: Rect[];
  collectibles?: Point[];
  hazards?: Rect[];
  worldWidth?: number;
  worldHeight?: number;
}

export interface CollectorLevelData {
  genre: 'collector';
  targetScore: number;
  totalItems: number;
  player?: Point & { radius?: number };
  collectibles?: Point[];
}

export type VerificationStatus = 'verified' | 'issue_detected' | 'insufficient_data';

export interface SolvabilityReport {
  passed: boolean;
  status: VerificationStatus;
  genre: GameGenre;
  errors: string[];
  warnings: string[];
  details?: {
    pathLength?: number;
    collectiblesTotal?: number;
    collectiblesReachable?: number;
    exitReachable?: boolean;
    maxJumpHeight?: number;
    maxJumpDistance?: number;
    unreachablePlatforms?: Rect[];
    stageTransitions?: {
      isMultiStage: boolean;
      passed: boolean;
      stagesCount?: number;
    };
  };
}
