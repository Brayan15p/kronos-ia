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

export type GestureType =
  | 'Closed_Fist' | 'Open_Palm' | 'Pointing_Up'
  | 'Thumb_Down'  | 'Thumb_Up'  | 'Victory'
  | 'ILoveYou'   | 'None'      | 'Unknown';

export type GripType = 'power' | 'pinch' | 'lateral' | 'hook' | 'none';

export type ObjectCategory = 'cylindrical' | 'small' | 'flat' | 'hooked' | 'none';

export interface HandState {
  isEmpty: boolean;
  gesture: GestureType;
  gestureScore: number; // 0–100
  gripType: GripType;
  objectCategory: ObjectCategory;
}

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

export interface DetectedObject {
  label: string;          // COCO name  (e.g. "scissors")
  labelEs: string;        // Spanish     (e.g. "Tijeras")
  emoji: string;          // display emoji
  color: string;          // hex display color
  score: number;          // 0-100
  boundingBox: { originX: number; originY: number; width: number; height: number };
}

export interface VisionResults {
  poseLandmarks: Landmark[] | null;
  leftHandLandmarks: Landmark[] | null;
  rightHandLandmarks: Landmark[] | null;
  faceLandmarks: Landmark[] | null;
  // Gesture recognition
  leftGesture?: GestureType | null;
  rightGesture?: GestureType | null;
  leftGestureScore?: number;
  rightGestureScore?: number;
  leftHandState?: HandState | null;
  rightHandState?: HandState | null;
  faceBlendshapes?: BlendshapeCategory[] | null;
  // Object detection
  leftObjectInHand?: DetectedObject | null;
  rightObjectInHand?: DetectedObject | null;
  allDetections?: DetectedObject[];
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

export type VirtualObjectType =
  | 'none' | 'caja' | 'herramienta' | 'martillo' | 'destornillador'
  | 'tornillo' | 'componente' | 'pcb' | 'engranaje' | 'palanca'
  | 'pantalla' | 'boton';

export interface ExpertTemplate {
  name: string;
  recordedAt: number;
  therbligs: { type: TherbligType; duration: number; tolerance?: number }[];
  avgEfficiency: number;
  samples?: number;
  consistency?: number;
}

/** Adjustable thresholds for the Vision AI classifiers. */
export interface ClassifierConfig {
  gripThreshold: number;   // avgCurl above → mano agarrando
  openThreshold: number;   // avgCurl below → mano abierta
  motionThreshold: number; // velocity above → en movimiento
  fastThreshold: number;   // velocity above → movimiento rápido
  debounceFrames: number;  // frames estables antes de confirmar un therblig
  decisionDelayMs: number; // tiempo mínimo (ms) que un therblig debe sostenerse antes de confirmarse
  criticality: number;     // rigor del análisis de therbligs (>1 = más crítico, detecta más desperdicio)
  rulaStrictness: number;  // multiplicador de rigor RULA (1 = estándar)
  drowsyEAR: number;       // EAR bajo este umbral → somnolencia/fatiga
}

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  gripThreshold: 0.52,
  openThreshold: 0.28,
  motionThreshold: 0.007,
  fastThreshold: 0.02,
  debounceFrames: 10,
  decisionDelayMs: 350,
  criticality: 1.25,
  rulaStrictness: 1.1,
  drowsyEAR: 0.21,
};
