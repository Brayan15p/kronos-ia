import { Landmark, TherbligType, EmotionState, EmotionLevel, PostureScore, HeadPose, EyeState } from './types';

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
  velocity: number
): TherbligType {
  const thumb  = fingerCurl(hand, 1, 4);
  const index  = fingerCurl(hand, 5, 8);
  const middle = fingerCurl(hand, 9, 12);
  const ring   = fingerCurl(hand, 13, 16);
  const pinky  = fingerCurl(hand, 17, 20);
  const avgCurl = (thumb + index + middle + ring + pinky) / 5;

  const isGripping = avgCurl > 0.52;
  const isOpen     = avgCurl < 0.28;
  const isMoving   = velocity > 0.007;
  const isFast     = velocity > 0.02;
  const isStill    = velocity < 0.002;
  const isErratic  = velocity > 0.012 && velocity < 0.022;
  const handsNear  = otherHand ? dist2d(hand[0], otherHand[0]) < 0.18 : false;

  if (handsNear && isMoving) return 'A';
  if (isGripping && isFast)  return 'TL';
  if (isOpen && isFast)      return 'TE';
  if (isGripping && isStill) return isErratic ? 'H' : 'G';
  if (isOpen && isStill && velocity < 0.003) return 'RL';
  if (isErratic && !isGripping) return 'Sh';
  if (avgCurl > 0.3 && avgCurl < 0.55 && !isMoving) return 'Se';
  if (isStill && !isGripping) return 'AD';
  if (isMoving && !isGripping) return 'P';
  return 'U';
}

export function calculateRULA(pose: Landmark[]): PostureScore {
  const empty: PostureScore = { rula: 1, neckAngle: 0, trunkAngle: 0, upperArmAngle: 0, forearmAngle: 0, wristAngle: 0, risk: 'low' };
  if (!pose || pose.length < 25) return empty;

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
  if (neckAngle > 20)    score += 2; else if (neckAngle > 10) score += 1;
  if (trunkAngle > 60)   score += 3; else if (trunkAngle > 20) score += 2; else if (trunkAngle > 5) score += 1;
  if (upperArmAngle > 90) score += 2; else if (upperArmAngle > 45) score += 1;
  if (wristAngle > 15)   score += 2; else if (wristAngle > 5) score += 1;

  const rula  = Math.min(7, Math.max(1, score));
  const risk: PostureScore['risk'] = rula <= 2 ? 'low' : rula <= 4 ? 'medium' : rula <= 6 ? 'high' : 'critical';

  return { rula, neckAngle: Math.round(neckAngle), trunkAngle: Math.round(trunkAngle), upperArmAngle: Math.round(upperArmAngle), forearmAngle: Math.round(forearmAngle), wristAngle: Math.round(wristAngle), risk };
}

export function analyzeFace(face: Landmark[]): { emotion: EmotionState; head: HeadPose; eyes: EyeState } {
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

  let level: EmotionLevel;
  let score: number;
  if (avgEAR < 0.14)                           { level = 'fatigued';  score = 10; }
  else if (avgEAR < 0.21)                      { level = 'fatigued';  score = 28; }
  else if (browTension > 0.72 && smile < 0)    { level = 'stressed';  score = 32; }
  else if (smile > 0.35 && avgEAR > 0.24)      { level = 'motivated'; score = 92; }
  else if (smile > 0.12)                       { level = 'focused';   score = 68; }
  else if (browTension > 0.5)                  { level = 'stressed';  score = 40; }
  else                                         { level = 'neutral';   score = 52; }

  return {
    emotion: { level, score, ear: avgEAR, smile, stress: browTension, timestamp: Date.now() },
    head:    { yaw: Math.round(yaw), pitch: Math.round(pitch), roll: Math.round(roll) },
    eyes:    { leftEAR: personLeftEAR, rightEAR: personRightEAR, avgEAR, isClosed: avgEAR < 0.14, isDrowsy: avgEAR < 0.21 },
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
