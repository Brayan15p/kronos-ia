export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type TherbligType =
  | 'G' | 'TL' | 'RL' | 'A' | 'U' | 'P' | 'TE' | 'DA'
  | 'Sh' | 'Se' | 'H' | 'AD' | 'Pn' | 'UD' | 'R' | 'I';

export interface TherbligEvent {
  type: TherbligType;
  startTime: number;
  duration: number;
  hand: 'left' | 'right' | 'both';
}

export type EmotionLevel = 'fatigued' | 'stressed' | 'neutral' | 'focused' | 'motivated';

export interface EmotionState {
  level: EmotionLevel;
  score: number;
  ear: number;
  smile: number;
  stress: number;
  timestamp: number;
}

export interface PostureScore {
  rula: number;
  neckAngle: number;
  trunkAngle: number;
  upperArmAngle: number;
  forearmAngle: number;
  wristAngle: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface EyeState {
  leftEAR: number;
  rightEAR: number;
  avgEAR: number;
  isClosed: boolean;
  isDrowsy: boolean;
}

export interface VisionResults {
  poseLandmarks: Landmark[] | null;
  leftHandLandmarks: Landmark[] | null;
  rightHandLandmarks: Landmark[] | null;
  faceLandmarks: Landmark[] | null;
}

export interface SessionSnapshot {
  timestamp: number;
  therblig: TherbligType | null;
  emotion: EmotionLevel;
  emotionScore: number;
  rula: number;
  ear: number;
}

export interface VisionSession {
  startTime: number;
  endTime: number | null;
  snapshots: SessionSnapshot[];
  therbligs: TherbligEvent[];
}

export type VirtualObjectType = 'none' | 'caja' | 'herramienta' | 'componente' | 'pantalla' | 'boton';

export interface ExpertTemplate {
  name: string;
  recordedAt: number;
  therbligs: { type: TherbligType; duration: number }[];
  avgEfficiency: number;
}
