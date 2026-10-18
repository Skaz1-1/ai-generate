import type { SolvabilityReport } from './utils/solvability/types.ts';

export interface GameVersion {
  id: string;
  version: number;
  prompt: string;
  html: string;
  timestamp: Date;
  warnings?: string[];
  solvability?: SolvabilityReport;
  wasFixed?: boolean;
  adaptationNotice?: string;
}

export interface GenerationOptions {
  audience: string;
  difficulty: string;
}

export type GenerationStage = 
  | 'idle' 
  | 'analyzing' 
  | 'architecting' 
  | 'coding' 
  | 'validating' 
  | 'ready' 
  | 'error';
