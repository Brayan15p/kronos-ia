/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
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

// ── Ergonomía honesta: confianza por segmento, vista de cámara y REBA ────────

/** Segmentos corporales evaluados (cuello, tronco, brazo, antebrazo, muñeca y piernas). */
export type ErgoSegment = 'cuello' | 'tronco' | 'brazo' | 'antebrazo' | 'muneca' | 'piernas';

/** Semáforo de confianza: alta = verde, media = amarillo, baja = rojo. */
export type ConfidenceLevel = 'alta' | 'media' | 'baja';

export interface SegmentConfidence {
  value: number;          // 0–1: prior de fiabilidad × visibilidad × factor de vista
  level: ConfidenceLevel;
  visibility: number;     // 0–1: visibilidad mínima de los landmarks del segmento
  assumed?: boolean;      // true → el segmento no se midió y se asumió neutro
}

export type SegmentConfidenceMap = Record<ErgoSegment, SegmentConfidence>;

/** Ángulo desde el que la cámara ve al operario. */
export type CameraView = 'lateral' | 'oblicua' | 'frontal' | 'desconocida';

export interface ViewEstimate {
  view: CameraView;
  /** Ancho de hombros en x ÷ largo del torso (corregido por aspecto). ~0 de perfil, ~0.7 de frente. */
  ratio: number;
}

export type RebaRisk = 'inapreciable' | 'bajo' | 'medio' | 'alto' | 'muy alto';

export interface RebaResult {
  score: number;          // 1–15
  risk: RebaRisk;
  scoreA: number;         // Tabla A + carga
  scoreB: number;         // Tabla B + agarre
  tableC: number;
  components: { trunk: number; neck: number; legs: number; upperArm: number; lowerArm: number; wrist: number };
  angles: { trunk: number; neck: number; knee: number | null; upperArm: number; elbow: number; wrist: number | null };
  side: 'izquierdo' | 'derecho';
  legsAssumed: boolean;
  wristAssumed: boolean;
  confidence: SegmentConfidenceMap;
  overallConfidence: number; // 0–1
}

/** Desglose de RULA (McAtamney y Corlett, 1993). */
export interface RulaDetail {
  components: { upperArm: number; lowerArm: number; wrist: number; wristTwist: number; neck: number; trunk: number; legs: number };
  tableA: number;          // brazo/antebrazo/muñeca
  tableB: number;          // cuello/tronco/piernas
  scoreC: number;          // Tabla A + uso muscular + carga
  scoreD: number;          // Tabla B + uso muscular + carga
  side: 'izquierdo' | 'derecho';
  strictness: number;      // rigor aplicado (1 = método publicado)
  wristAssumed: boolean;   // mano no visible → muñeca asumida neutra
}

export interface PostureScore {
  rula: number;            // 1–7 (Tabla C de RULA)
  // Ángulos relativos al cuerpo, en grados, del lado analizado:
  neckAngle: number;       // cuello respecto al eje del tronco
  trunkAngle: number;      // tronco respecto a la vertical
  upperArmAngle: number;   // brazo respecto al eje del tronco
  forearmAngle: number;    // flexión de codo (0 = brazo estirado); alimenta la puntuación del antebrazo
  wristAngle: number;      // mano respecto al antebrazo (0 si la mano no es visible)
  risk: 'low' | 'medium' | 'high' | 'critical'; // niveles de acción RULA: 1–2 / 3–4 / 5–6 / 7
  // Campos opcionales (ergonomía honesta). Opcionales para no romper otros consumidores.
  /** Confianza por segmento de los ángulos RULA mostrados (lado analizado). */
  confidence?: SegmentConfidenceMap;
  /** Confianza global 0–1 (promedio de cuello, tronco, brazo, antebrazo y muñeca). */
  overallConfidence?: number;
  view?: ViewEstimate;
  reba?: RebaResult;
  rulaDetail?: RulaDetail;
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
  reba?: number;
  /** Confianza ergonómica global 0–1 en el momento de la muestra. */
  ergoConfidence?: number;
  /** Vista de cámara estimada en el momento de la muestra (para la «vista predominante» en SG-SST). */
  view?: CameraView;
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
  rulaStrictness: number;  // rigor RULA: multiplica la desviación de cada ángulo antes de clasificarlo (1 = método publicado)
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
  rulaStrictness: 1,
  drowsyEAR: 0.21,
};
