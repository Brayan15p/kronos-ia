import { Landmark, TherbligType, EmotionState, EmotionLevel, PostureScore, HeadPose, EyeState, ClassifierConfig, DEFAULT_CLASSIFIER_CONFIG, GestureType, GripType, HandState, ObjectCategory, BlendshapeCategory } from './types';

export function dist2d(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function dist3d(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);
  return mag === 0 ? 0 : (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI;
}

export function fingerCurl(lm: Landmark[], mcp: number, tip: number): number {
  const wristToMcp = dist2d(lm[0], lm[mcp]);
  const wristToTip = dist2d(lm[0], lm[tip]);
  return Math.max(0, Math.min(1, 1 - wristToTip / Math.max(0.01, wristToMcp * 1.8)));
}

export function earValue(lm: Landmark[], top: number, bot: number, inner: number, outer: number): number {
  if (!lm[top] || !lm[bot] || !lm[inner] || !lm[outer]) return 0.3;
  const v = dist2d(lm[top], lm[bot]);
  const h = dist2d(lm[inner], lm[outer]);
  return h > 0.001 ? v / h : 0.3;
}

/** Smooth value with exponential moving average */
export function ema(prev: number, next: number, alpha = 0.25): number {
  return prev + alpha * (next - prev);
}

export function classifyTherblig(
  hand: Landmark[],
  otherHand: Landmark[] | null,
  velocity: number,
  config: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG
): TherbligType {
  const thumb  = fingerCurl(hand, 1, 4);
  const index  = fingerCurl(hand, 5, 8);
  const middle = fingerCurl(hand, 9, 12);
  const ring   = fingerCurl(hand, 13, 16);
  const pinky  = fingerCurl(hand, 17, 20);
  const avgCurl = (thumb + index + middle + ring + pinky) / 5;

  // criticality > 1 → el modelo es más exigente: detecta antes las demoras/quietud
  // y es más estricto al considerar un movimiento "errático" (búsqueda).
  const crit = Math.max(0.5, config.criticality ?? 1);

  const isGripping = avgCurl > config.gripThreshold;
  const isOpen     = avgCurl < config.openThreshold;
  const isMoving   = velocity > config.motionThreshold;
  const isFast     = velocity > config.fastThreshold;
  const isStill    = velocity < 0.002 * crit;                       // más crítico ⇒ marca quietud antes
  const isErratic  = velocity > (0.011 / crit) && velocity < 0.024; // más crítico ⇒ búsqueda más sensible

  // Contexto entre manos
  const handDist  = otherHand ? dist2d(hand[0], otherHand[0]) : 1;
  const handsNear = handDist < 0.18;
  const handsFar  = otherHand ? handDist > 0.45 : false;

  // Posición vertical de la muñeca (0 = arriba del encuadre, 1 = abajo)
  const handY    = hand[0]?.y ?? 0.5;
  const handHigh = handY < 0.38;   // mano elevada → inspección / planeación
  const handLow  = handY > 0.82;   // mano caída    → descanso

  // Orden: de la combinación más específica a la más genérica.
  if (handsNear && isMoving && isGripping)   return 'A';   // Assemble: ambas manos juntas trabajando
  if (handsFar  && isFast   && isGripping)   return 'DA';  // Disassemble: separar piezas con fuerza
  if (isGripping && isFast)                  return 'TL';  // Transport Loaded
  if (isOpen     && isFast)                  return 'TE';  // Transport Empty
  if (isGripping && isErratic)               return 'U';   // Use: agarre con oscilación (usar herramienta)
  if (isGripping && isStill)                 return 'H';   // Hold: retención estática (ineficiente)
  if (isGripping)                            return 'G';   // Grasp
  if (isOpen && isStill && handLow)          return 'R';   // Rest: mano caída, en reposo
  if (isOpen && isStill && handHigh)         return 'Pn';  // Plan: mano arriba, deliberando
  if (isOpen && isStill && velocity < 0.003) return 'RL';  // Release Load
  if (isErratic && isOpen)                   return 'Sh';  // Search: búsqueda sin dirección
  if (avgCurl > 0.30 && avgCurl < 0.55 && handHigh && !isMoving) return 'I';  // Inspect: examinar elevando
  if (avgCurl > 0.30 && avgCurl < 0.55 && !isMoving)             return 'Se'; // Select: selección vacilante
  if (isStill && !isGripping)                return 'AD';  // Avoidable Delay: quieto sin agarrar
  if (isMoving && !isGripping)               return 'P';   // Position
  return 'U';
}

/**
 * Estándares de referencia (ms) por therblig — orden de magnitud basado en
 * sistemas de tiempos predeterminados (MTM/Therblig). Sirven para que el modelo
 * sea "más crítico": si un therblig eficiente dura mucho más que su referencia,
 * o si aparecen therbligs ineficientes, se penaliza la valoración del puesto.
 */
export const THERBLIG_STANDARD_MS: Record<string, number> = {
  G: 700, TL: 900, RL: 500, A: 1500, U: 1200, P: 800, TE: 700, DA: 1200,
  Sh: 300, Se: 400, H: 200, AD: 0, Pn: 500, UD: 0, R: 0, I: 1000,
};

export function calculateRULA(pose: Landmark[], strictness = 1): PostureScore {
  const empty: PostureScore = { rula: 1, neckAngle: 0, trunkAngle: 0, upperArmAngle: 0, forearmAngle: 0, wristAngle: 0, risk: 'low' };
  if (!pose || pose.length < 25) return empty;

  // strictness > 1 → umbrales más bajos → penaliza posturas con mayor facilidad.
  const s = Math.max(0.1, strictness);
  const t = (threshold: number) => threshold / s;

  const nose = pose[0];
  const ls = pose[11]; const rs = pose[12];
  const le = pose[13];
  const lw = pose[15];
  const lh = pose[23]; const rh = pose[24];

  const shoulderMid: Landmark = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: 0 };
  const hipMid: Landmark      = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: 0 };
  const above: Landmark       = { x: shoulderMid.x, y: shoulderMid.y - 0.3, z: 0 };
  const aboveHip: Landmark    = { x: hipMid.x, y: hipMid.y - 0.3, z: 0 };

  const neckAngle     = Math.min(60, angleDeg(nose, shoulderMid, above));
  const trunkAngle    = Math.min(80, angleDeg(shoulderMid, hipMid, aboveHip));
  const upperArmAngle = angleDeg(shoulderMid, ls, le);
  const forearmAngle  = angleDeg(ls, le, lw);
  const wristRef: Landmark = { x: lw.x + 0.1, y: lw.y, z: 0 };
  const wristAngle    = Math.abs(angleDeg(le, lw, wristRef) - 180);

  let score = 1;
  if (neckAngle > t(20))    score += 2; else if (neckAngle > t(10)) score += 1;
  if (trunkAngle > t(60))   score += 3; else if (trunkAngle > t(20)) score += 2; else if (trunkAngle > t(5)) score += 1;
  if (upperArmAngle > t(90)) score += 2; else if (upperArmAngle > t(45)) score += 1;
  if (wristAngle > t(15))   score += 2; else if (wristAngle > t(5)) score += 1;

  const rula  = Math.min(7, Math.max(1, score));
  const risk: PostureScore['risk'] = rula <= 2 ? 'low' : rula <= 4 ? 'medium' : rula <= 6 ? 'high' : 'critical';

  return { rula, neckAngle: Math.round(neckAngle), trunkAngle: Math.round(trunkAngle), upperArmAngle: Math.round(upperArmAngle), forearmAngle: Math.round(forearmAngle), wristAngle: Math.round(wristAngle), risk };
}

export function analyzeFace(face: Landmark[], drowsyEAR = 0.21): { emotion: EmotionState; head: HeadPose; eyes: EyeState } {
  const defEmotion: EmotionState = { level: 'neutral', score: 50, ear: 0.3, smile: 0, stress: 0, timestamp: Date.now() };
  const defHead: HeadPose  = { yaw: 0, pitch: 0, roll: 0 };
  const defEyes: EyeState  = { leftEAR: 0.3, rightEAR: 0.3, avgEAR: 0.3, isClosed: false, isDrowsy: false };
  if (!face || face.length < 400) return { emotion: defEmotion, head: defHead, eyes: defEyes };

  // FIX: MediaPipe face mesh indices are from the CAMERA perspective (mirrored).
  // Camera's "left" eye (indices 33,133,159,145) = person's RIGHT eye.
  // Camera's "right" eye (indices 263,362,386,374) = person's LEFT eye.
  // We swap so leftEAR/rightEAR match the person's actual eye.
  const personLeftEAR  = earValue(face, 386, 374, 362, 263); // camera-right = person-left
  const personRightEAR = earValue(face, 159, 145, 133, 33);  // camera-left  = person-right
  const avgEAR = (personLeftEAR + personRightEAR) / 2;

  // Mouth
  const lCorner = face[61]; const rCorner = face[291];
  const lipTop  = face[13];
  const smileRaw = lCorner && rCorner && lipTop
    ? (lipTop.y - (lCorner.y + rCorner.y) / 2) * 25 : 0;
  const smile = Math.max(-1, Math.min(1, smileRaw));

  // Brow tension
  const lBrow    = face[70];  const lEyeTop = face[159];
  const browTension = lBrow && lEyeTop
    ? Math.max(0, Math.min(1, 1 - (lEyeTop.y - lBrow.y) * 22)) : 0;

  // Head pose
  const lec = face[33]; const rec = face[263];
  const yaw   = lec && rec ? (rec.x - lec.x - 0.18) * 90 : 0;
  const noseTip = face[4] || face[1];
  const noseTop = face[168] || face[1];
  const pitch = noseTip && noseTop ? (noseTip.y - noseTop.y - 0.08) * 85 : 0;
  const roll  = lec && rec ? (rec.y - lec.y) * 100 : 0;

  // closedEAR escala con drowsyEAR (≈2/3 del umbral de somnolencia, como 0.14/0.21).
  const closedEAR = drowsyEAR * (0.14 / 0.21);

  let level: EmotionLevel;
  let score: number;
  if (avgEAR < closedEAR)                       { level = 'fatigued';  score = 10; }
  else if (avgEAR < drowsyEAR)                  { level = 'fatigued';  score = 28; }
  else if (browTension > 0.72 && smile < 0)    { level = 'stressed';  score = 32; }
  else if (smile > 0.35 && avgEAR > 0.24)      { level = 'motivated'; score = 92; }
  else if (smile > 0.12)                       { level = 'focused';   score = 68; }
  else if (browTension > 0.5)                  { level = 'stressed';  score = 40; }
  else                                         { level = 'neutral';   score = 52; }

  return {
    emotion: { level, score, ear: avgEAR, smile, stress: browTension, timestamp: Date.now() },
    head:    { yaw: Math.round(yaw), pitch: Math.round(pitch), roll: Math.round(roll) },
    eyes:    { leftEAR: personLeftEAR, rightEAR: personRightEAR, avgEAR, isClosed: avgEAR < closedEAR, isDrowsy: avgEAR < drowsyEAR },
  };
}

// ── Gesture display metadata ──────────────────────────────────────────────────
export const GESTURE_DISPLAY: Record<GestureType, { emoji: string; label: string; color: string }> = {
  Closed_Fist:  { emoji: '✊', label: 'Puño cerrado',  color: '#f59e0b' },
  Open_Palm:    { emoji: '✋', label: 'Palma abierta', color: '#22d3ee' },
  Pointing_Up:  { emoji: '☝️', label: 'Señalar',       color: '#818cf8' },
  Thumb_Down:   { emoji: '👎', label: 'Rechazo',       color: '#f43f5e' },
  Thumb_Up:     { emoji: '👍', label: 'Aprobado',      color: '#4ade80' },
  Victory:      { emoji: '✌️', label: 'Victoria',      color: '#a3e635' },
  ILoveYou:     { emoji: '🤟', label: 'Genial',        color: '#e879f9' },
  None:         { emoji: '—',  label: 'Ninguno',       color: '#64748b' },
  Unknown:      { emoji: '?',  label: 'Desconocido',   color: '#64748b' },
};

// Gesture → therblig (override when confidence is high)
const GESTURE_THERBLIG_MAP: Partial<Record<GestureType, TherbligType>> = {
  Closed_Fist:  'G',   // Grasp
  Open_Palm:    'RL',  // Release Load
  Pointing_Up:  'P',   // Position
  Thumb_Up:     'I',   // Inspect
  Thumb_Down:   'AD',  // Avoidable Delay
  Victory:      'DA',  // Disassemble
  ILoveYou:     'U',   // Use
};

const GRIP_OBJECT: Record<GripType, ObjectCategory> = {
  power:   'cylindrical',
  pinch:   'small',
  lateral: 'flat',
  hook:    'hooked',
  none:    'none',
};

/** Classify what the hand is doing: empty, grip type, object category */
export function classifyHandState(
  hand: Landmark[],
  gesture: GestureType,
  gestureScore: number,
): HandState {
  const thumbC  = fingerCurl(hand, 1, 4);
  const indexC  = fingerCurl(hand, 5, 8);
  const middleC = fingerCurl(hand, 9, 12);
  const ringC   = fingerCurl(hand, 13, 16);
  const pinkyC  = fingerCurl(hand, 17, 20);
  const avgCurl = (thumbC + indexC + middleC + ringC + pinkyC) / 5;

  const isEmpty = gesture === 'Open_Palm' || (avgCurl < 0.30 && gesture !== 'Closed_Fist');

  let gripType: GripType = 'none';
  if (!isEmpty) {
    if (avgCurl > 0.52 && thumbC > 0.38) {
      gripType = 'power';   // botella, mango de herramienta
    } else if (thumbC > 0.62 && indexC > 0.62 && middleC < 0.42) {
      gripType = 'pinch';   // objeto pequeño
    } else if (thumbC < 0.28 && avgCurl > 0.40) {
      gripType = 'hook';    // ganchillo, asa
    } else {
      gripType = 'lateral'; // objeto plano
    }
  }

  return {
    isEmpty,
    gesture,
    gestureScore: Math.round(gestureScore * 100),
    gripType,
    objectCategory: GRIP_OBJECT[gripType],
  };
}

/**
 * Contextual therblig classifier (v2).
 *
 * Decision priority:
 *   1. High-confidence gesture (≥ 0.76) → direct map
 *   2. Object-in-hand context → object-aware therbligs
 *   3. Curl + velocity fallback (original classifier)
 */
export function classifyTherbligContextual(
  hand: Landmark[],
  otherHand: Landmark[] | null,
  velocity: number,
  gesture: GestureType | null | undefined,
  gestureScore: number | undefined,
  hasObjectInHand: boolean,
  config: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
): TherbligType {
  // ── 1. Gesture override ──────────────────────────────────────────────────
  const gScore = gestureScore ?? 0;
  if (gesture && gesture !== 'None' && gesture !== 'Unknown' && gScore >= 0.76) {
    const mapped = GESTURE_THERBLIG_MAP[gesture];
    if (mapped) return mapped;
  }

  // ── Shared derived signals ────────────────────────────────────────────────
  const thumb  = fingerCurl(hand, 1, 4);
  const index  = fingerCurl(hand, 5, 8);
  const middle = fingerCurl(hand, 9, 12);
  const ring   = fingerCurl(hand, 13, 16);
  const pinky  = fingerCurl(hand, 17, 20);
  const avgCurl = (thumb + index + middle + ring + pinky) / 5;
  const crit = Math.max(0.5, config.criticality ?? 1);

  const isGripping = avgCurl > config.gripThreshold;
  const isOpen     = avgCurl < config.openThreshold;
  const isMoving   = velocity > config.motionThreshold;
  const isFast     = velocity > config.fastThreshold;
  const isStill    = velocity < 0.002 * crit;
  const isErratic  = velocity > (0.011 / crit) && velocity < 0.024;

  const handDist  = otherHand ? dist2d(hand[0], otherHand[0]) : 1;
  const handsNear = handDist < 0.18;
  const handsFar  = otherHand ? handDist > 0.45 : false;
  const handY     = hand[0]?.y ?? 0.5;
  const handHigh  = handY < 0.38;
  const handLow   = handY > 0.82;

  // ── 2. Object-aware path ─────────────────────────────────────────────────
  if (hasObjectInHand) {
    // Two-hand operations with object
    if (handsNear && isMoving && isGripping)  return 'A';   // Assemble
    if (handsFar  && isFast   && isGripping)  return 'DA';  // Disassemble
    // Moving with object → Transport Loaded
    if (isGripping && isFast)                 return 'TL';
    if (isGripping && isMoving)               return 'TL';
    // Oscillating tool use
    if (isGripping && isErratic)              return 'U';   // Use
    // Precise placement
    if (isMoving && !isGripping && handHigh)  return 'P';   // Position (about to release)
    // Stationary hold
    if (isGripping && isStill)                return 'H';   // Hold
    // Release zone
    if (isOpen && isStill)                    return 'RL';  // Release Load
    return 'G'; // Default when object in hand
  }

  // ── 3. No object detected — original curl+velocity logic ─────────────────
  if (handsNear && isMoving && isGripping)    return 'A';
  if (handsFar  && isFast   && isGripping)    return 'DA';
  if (isGripping && isFast)                   return 'TE';  // Fast grip, no object → TE
  if (isOpen    && isFast)                    return 'TE';  // Transport Empty
  if (isGripping && isErratic)                return 'U';
  if (isGripping && isStill)                  return 'G';   // Grasp (ready to pick)
  if (isOpen && isStill && handLow)           return 'R';   // Rest
  if (isOpen && isStill && handHigh)          return 'Pn';  // Plan
  if (isOpen && isStill && velocity < 0.003)  return 'RL';
  if (isErratic && isOpen)                    return 'Sh';  // Search
  if (avgCurl > 0.30 && avgCurl < 0.55 && handHigh && !isMoving) return 'I';  // Inspect
  if (avgCurl > 0.30 && avgCurl < 0.55 && !isMoving)             return 'Se'; // Select
  if (isStill && !isGripping)                 return 'AD';  // Avoidable Delay
  if (isMoving && !isGripping)                return 'P';   // Position
  return 'U';
}

/** @deprecated Use classifyTherbligContextual */
export function classifyTherbligEnhanced(
  hand: Landmark[], otherHand: Landmark[] | null, velocity: number,
  gesture: GestureType | null | undefined, gestureScore: number | undefined,
  config: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
): TherbligType {
  return classifyTherbligContextual(hand, otherHand, velocity, gesture, gestureScore, false, config);
}

/** Analyze emotion using face blendshapes (highly accurate) with landmark fallback */
export function analyzeEmotionEnhanced(
  face: Landmark[],
  blendshapes: BlendshapeCategory[] | null | undefined,
  config: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
): ReturnType<typeof analyzeFace> {
  if (!blendshapes || blendshapes.length === 0) {
    return analyzeFace(face, config.drowsyEAR);
  }

  const get = (name: string): number =>
    blendshapes.find(b => b.categoryName === name)?.score ?? 0;

  const smileL    = get('mouthSmileLeft');
  const smileR    = get('mouthSmileRight');
  const smile     = (smileL + smileR) / 2;
  const browDown  = (get('browDownLeft') + get('browDownRight')) / 2;
  const browInner = get('browInnerUp');
  const jawOpen   = get('jawOpen');
  const blinkL    = get('eyeBlinkLeft');
  const blinkR    = get('eyeBlinkRight');
  const avgBlink  = (blinkL + blinkR) / 2;
  // EAR approximation from blink blendshape (inverted: 0=open, 1=closed)
  const avgEAR    = Math.max(0.08, 1 - avgBlink * 1.15);
  const isDrowsy  = avgEAR < config.drowsyEAR;

  let level: EmotionLevel;
  let score: number;

  if (avgBlink > 0.70) {
    level = 'fatigued';  score = 10;
  } else if (avgEAR < config.drowsyEAR) {
    level = 'fatigued';  score = 28;
  } else if (browDown > 0.55 && smile < 0.15) {
    level = 'stressed';  score = 22 + Math.round(browDown * 20);
  } else if (smile > 0.42 && browInner < 0.3 && avgEAR > 0.25) {
    level = 'motivated'; score = 88 + Math.round(smile * 12);
  } else if (smile > 0.18) {
    level = 'focused';   score = 60 + Math.round(smile * 30);
  } else if (browDown > 0.35 || browInner > 0.50) {
    level = 'stressed';  score = 35 + Math.round(browDown * 15);
  } else {
    level = 'neutral';   score = 50 + Math.round(jawOpen * -10);
  }

  const clampedScore = Math.max(5, Math.min(100, score));

  return {
    emotion: {
      level, score: clampedScore,
      ear: avgEAR, smile, stress: browDown,
      timestamp: Date.now(),
    },
    head: { yaw: 0, pitch: 0, roll: 0 },
    eyes: {
      leftEAR: 1 - blinkL, rightEAR: 1 - blinkR,
      avgEAR, isClosed: avgBlink > 0.85, isDrowsy,
    },
  };
}

export const THERBLIG_INFO: Record<string, { label: string; efficient: boolean; color: string; bg: string; desc: string }> = {
  G:  { label: 'Grasp',             efficient: true,  color: '#22d3ee', bg: 'rgba(34,211,238,0.12)',  desc: 'Agarre del objeto' },
  TL: { label: 'Transport Loaded',  efficient: true,  color: '#34d399', bg: 'rgba(52,211,153,0.12)',  desc: 'Transporte con carga' },
  RL: { label: 'Release Load',      efficient: true,  color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  desc: 'Soltada de carga' },
  A:  { label: 'Assemble',          efficient: true,  color: '#a3e635', bg: 'rgba(163,230,53,0.12)',  desc: 'Ensamblaje' },
  U:  { label: 'Use',               efficient: true,  color: '#86efac', bg: 'rgba(134,239,172,0.12)', desc: 'Uso de objeto' },
  P:  { label: 'Position',          efficient: true,  color: '#6ee7b7', bg: 'rgba(110,231,183,0.12)', desc: 'Posicionamiento preciso' },
  TE: { label: 'Transport Empty',   efficient: true,  color: '#5eead4', bg: 'rgba(94,234,212,0.12)',  desc: 'Transporte vacío' },
  DA: { label: 'Disassemble',       efficient: true,  color: '#67e8f9', bg: 'rgba(103,232,249,0.12)', desc: 'Desensamblaje' },
  Sh: { label: 'Search',            efficient: false, color: '#f87171', bg: 'rgba(248,113,113,0.12)', desc: 'Búsqueda sin dirección' },
  Se: { label: 'Select',            efficient: false, color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  desc: 'Selección vacilante' },
  H:  { label: 'Hold',              efficient: false, color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  desc: 'Retención innecesaria' },
  AD: { label: 'Avoidable Delay',   efficient: false, color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',   desc: 'Demora evitable' },
  Pn: { label: 'Plan',              efficient: false, color: '#e879f9', bg: 'rgba(232,121,249,0.12)', desc: 'Planificación en proceso' },
  UD: { label: 'Unavoidable Delay', efficient: false, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', desc: 'Demora inevitable' },
  R:  { label: 'Rest',              efficient: false, color: '#818cf8', bg: 'rgba(129,140,248,0.12)', desc: 'Descanso no programado' },
  I:  { label: 'Inspect',           efficient: false, color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  desc: 'Inspección del objeto' },
};

export const EMOTION_INFO: Record<EmotionLevel, { emoji: string; label: string; color: string }> = {
  fatigued:  { emoji: '😴', label: 'Fatigado',    color: '#94a3b8' },
  stressed:  { emoji: '😟', label: 'Estresado',   color: '#f87171' },
  neutral:   { emoji: '😐', label: 'Neutro',      color: '#94a3b8' },
  focused:   { emoji: '🙂', label: 'Concentrado', color: '#34d399' },
  motivated: { emoji: '😄', label: 'Motivado',    color: '#22d3ee' },
};

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
