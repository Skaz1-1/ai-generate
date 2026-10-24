import type { SolvabilityReport } from './utils/solvability/types.ts';

export type GameScale = 'short' | 'medium' | 'large';

export interface GameVersion {
  id: string;
  version: number;
  prompt: string;
  html: string;
  timestamp: Date;
  scale?: GameScale;
  warnings?: string[];
  solvability?: SolvabilityReport;
  wasFixed?: boolean;
  adaptationNotice?: string;
}

export type GameDifficulty = 'Лёгкая' | 'Легкая' | 'Средняя' | 'Сложная' | 'Высокая';

export interface GenerationOptions {
  difficulty: GameDifficulty;
  scale: GameScale;
}

export type GenerationStage = 
  | 'idle' 
  | 'analyzing' 
  | 'architecting' 
  | 'coding' 
  | 'validating' 
  | 'ready' 
  | 'error';
