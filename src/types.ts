export interface GameVersion {
  id: string;
  version: number;
  prompt: string;
  html: string;
  timestamp: Date;
  warnings?: string[];
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
