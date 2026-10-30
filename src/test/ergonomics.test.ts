/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { calculateRULA } from '@/components/VisionAI/utils';
import PostureAnalyzer from '@/components/VisionAI/PostureAnalyzer';
import type { Landmark } from '@/components/VisionAI/types';
import {
  DEFAULT_ASPECT, REBA_TABLE_A, REBA_TABLE_B, REBA_TABLE_C,
  rebaTableA, rebaTableB, rebaTableC, rebaFromComponents, rebaRiskLevel,
  rebaTrunkScore, rebaNeckScore, rebaLegsScore, rebaUpperArmScore, rebaLowerArmScore, rebaWristScore,
  calculateREBA, estimateCameraView, segmentConfidence, computeSegmentConfidences, visibilityScore,
  SEGMENT_RELIABILITY,
} from '@/components/VisionAI/ergonomics';

// ── Poses sintéticas ─────────────────────────────────────────────────────────

/** Pose de 33 puntos con todos los landmarks no indicados en (0.5, 0.5). */
function makePose(points: Record<number, [number, number, number?]>, visibility = 1): Landmark[] {
  const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
  for (const [k, [x, y, z]] of Object.entries(points)) pose[Number(k)] = { x, y, z: z ?? 0, visibility };
  return pose;
}

const rad = (d: number) => (d * Math.PI) / 180;

interface SideOpts {
  trunk?: number; neck?: number; upperArm?: number; elbow?: number; wrist?: number; knee?: number;
  facing?: 1 | -1; visibility?: number; farVisibility?: number;
}

/**
 * Operario visto de perfil, construido geométricamente con ángulos conocidos
 * (en coordenadas "reales"; x se divide por el aspecto como haría el video normalizado).
 * Ángulos de brazo y cuello relativos al tronco; negativos = extensión.
 */
function sidePose(o: SideOpts = {}): Landmark[] {
  const { trunk = 0, neck = 0, upperArm = 0, elbow = 80, wrist = 0, knee = 0, facing = 1, visibility = 1, farVisibility = 0.9 } = o;
  const f = facing;
  // dirección a partir de un ángulo β medido desde "abajo" hacia "adelante"
  const dirDown = (b: number) => ({ x: Math.sin(rad(b)) * f, y: Math.cos(rad(b)) });
  const add = (p: { x: number; y: number }, d: { x: number; y: number }, len: number) => ({ x: p.x + d.x * len, y: p.y + d.y * len });

  const hip = { x: 0.6, y: 0.55 };
  const shoulder = add(hip, dirDown(180 - trunk), 0.3);            // hacia arriba, inclinado adelante
  const ear = add(shoulder, dirDown(180 - trunk - neck), 0.14);
  const nose = { x: ear.x + 0.05 * f, y: ear.y + 0.01 };
  const elbowP = add(shoulder, dirDown(upperArm - trunk), 0.15);
  const wristP = add(elbowP, dirDown(upperArm - trunk + elbow), 0.13);
  const handP = add(wristP, dirDown(upperArm - trunk + elbow + wrist), 0.05);
  const kneeP = add(hip, dirDown(0), 0.2);
  const ankle = add(kneeP, dirDown(-knee), 0.2);

  const near: Record<string, { x: number; y: number }> = { ear, shoulder, elbow: elbowP, wrist: wristP, hand: handP, hip, knee: kneeP, ankle };
  const L = { ear: 7, shoulder: 11, elbow: 13, wrist: 15, pinky: 17, index: 19, hip: 23, knee: 25, ankle: 27 };
  const R = { ear: 8, shoulder: 12, elbow: 14, wrist: 16, pinky: 18, index: 20, hip: 24, knee: 26, ankle: 28 };

  const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
  const put = (i: number, p: { x: number; y: number }, v: number, dx = 0) => { pose[i] = { x: (p.x + dx) / DEFAULT_ASPECT, y: p.y, z: 0, visibility: v }; };
  put(0, nose, visibility);
  // Lado cercano = izquierdo; lado lejano (derecho) casi superpuesto y algo menos visible.
  for (const key of Object.keys(L) as (keyof typeof L)[]) {
    const p = key === 'pinky' || key === 'index' ? near.hand : near[key];
    put(L[key], p, visibility);
    put(R[key], p, farVisibility, 0.015);
  }
  return pose;
}

/** Operario de frente y erguido; antebrazos hacia la cámara (la muñeca se proyecta sobre el codo). */
function frontPose(visibility = 1): Landmark[] {
  const a = DEFAULT_ASPECT;
  return makePose({
    0: [0.5, 0.18],
    7: [0.5 - 0.05 / a, 0.2], 8: [0.5 + 0.05 / a, 0.2],
    11: [0.5 - 0.11 / a, 0.3], 12: [0.5 + 0.11 / a, 0.3],
    13: [0.5 - 0.12 / a, 0.45], 14: [0.5 + 0.12 / a, 0.45],
    15: [0.5 - 0.12 / a, 0.45], 16: [0.5 + 0.12 / a, 0.45],
    23: [0.5 - 0.08 / a, 0.6], 24: [0.5 + 0.08 / a, 0.6],
    25: [0.5 - 0.08 / a, 0.8], 26: [0.5 + 0.08 / a, 0.8],
    27: [0.5 - 0.08 / a, 0.98], 28: [0.5 + 0.08 / a, 0.98],
  }, visibility);
}

// ── 1. Tablas REBA ────────────────────────────────────────────────────────────
// Valores esperados tomados de las Tablas A, B y C de Hignett & McAtamney (2000),
// "Rapid Entire Body Assessment (REBA)", Applied Ergonomics 31(2):201–205.

describe('REBA — consultas en tablas publicadas', () => {
  it('Tabla A (tronco, cuello, piernas)', () => {
    expect(rebaTableA(1, 1, 1)).toBe(1);
    expect(rebaTableA(2, 1, 1)).toBe(2);
    expect(rebaTableA(3, 2, 2)).toBe(5);
    expect(rebaTableA(4, 3, 1)).toBe(6);
    expect(rebaTableA(1, 3, 1)).toBe(3);
    expect(rebaTableA(5, 3, 4)).toBe(9);
    expect(rebaTableA(5, 1, 4)).toBe(8);
  });

  it('Tabla B (brazo, antebrazo, muñeca)', () => {
    expect(rebaTableB(1, 1, 1)).toBe(1);
    expect(rebaTableB(3, 1, 2)).toBe(4);
    expect(rebaTableB(4, 2, 3)).toBe(7);
    expect(rebaTableB(5, 1, 3)).toBe(8);
    expect(rebaTableB(6, 2, 3)).toBe(9);
  });

  it('Tabla C (puntuación A, puntuación B)', () => {
    expect(rebaTableC(1, 1)).toBe(1);
    expect(rebaTableC(4, 5)).toBe(5);
    expect(rebaTableC(6, 9)).toBe(10);
    expect(rebaTableC(9, 10)).toBe(12);
    expect(rebaTableC(1, 12)).toBe(7);
    expect(rebaTableC(12, 1)).toBe(12);
    expect(rebaTableC(12, 12)).toBe(12);
  });

  it('las tablas tienen las dimensiones correctas y son monótonas (control de transcripción)', () => {
    expect(REBA_TABLE_A).toHaveLength(3);
    REBA_TABLE_A.forEach(t => { expect(t).toHaveLength(5); t.forEach(r => expect(r).toHaveLength(4)); });
    expect(REBA_TABLE_B).toHaveLength(2);
    REBA_TABLE_B.forEach(t => { expect(t).toHaveLength(6); t.forEach(r => expect(r).toHaveLength(3)); });
    expect(REBA_TABLE_C).toHaveLength(12);
    REBA_TABLE_C.forEach(r => expect(r).toHaveLength(12));

    for (let n = 1; n <= 3; n++) for (let t = 1; t <= 5; t++) for (let l = 1; l <= 4; l++) {
      const v = rebaTableA(t, n, l);
      if (n < 3) expect(rebaTableA(t, n + 1, l)).toBeGreaterThanOrEqual(v);
      if (t < 5) expect(rebaTableA(t + 1, n, l)).toBeGreaterThanOrEqual(v);
      if (l < 4) expect(rebaTableA(t, n, l + 1)).toBeGreaterThanOrEqual(v);
    }
    for (let u = 1; u <= 6; u++) for (let la = 1; la <= 2; la++) for (let w = 1; w <= 3; w++) {
      const v = rebaTableB(u, la, w);
      if (u < 6) expect(rebaTableB(u + 1, la, w)).toBeGreaterThanOrEqual(v);
      if (la < 2) expect(rebaTableB(u, la + 1, w)).toBeGreaterThanOrEqual(v);
      if (w < 3) expect(rebaTableB(u, la, w + 1)).toBeGreaterThanOrEqual(v);
    }
    for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) {
      const v = rebaTableC(a, b);
      if (a < 12) expect(rebaTableC(a + 1, b)).toBeGreaterThanOrEqual(v);
      if (b < 12) expect(rebaTableC(a, b + 1)).toBeGreaterThanOrEqual(v);
    }
  });
});

// ── 2. Límites de la puntuación y niveles de riesgo ───────────────────────────

describe('REBA — límites y niveles de riesgo', () => {
  const MIN = { trunk: 1, neck: 1, legs: 1, upperArm: 1, lowerArm: 1, wrist: 1 };
  const MAX = { trunk: 5, neck: 3, legs: 4, upperArm: 6, lowerArm: 2, wrist: 3 };

  it('postura neutra = 1 y peor caso con carga/agarre/actividad máximos = 15', () => {
    expect(rebaFromComponents(MIN).score).toBe(1);
    expect(rebaFromComponents(MAX).score).toBe(11); // Tabla C[9][9], sin carga, agarre ni actividad
    expect(rebaFromComponents(MAX, { load: 3, coupling: 3, activity: 3 }).score).toBe(15);
  });

  it('carga, agarre y actividad valen 0 por defecto', () => {
    const c = { trunk: 3, neck: 2, legs: 2, upperArm: 3, lowerArm: 2, wrist: 2 };
    expect(rebaFromComponents(c)).toEqual(rebaFromComponents(c, { load: 0, coupling: 0, activity: 0 }));
  });

  it('la puntuación siempre está en [1, 15], incluso con entradas fuera de rango', () => {
    for (let t = 0; t <= 6; t++) for (let u = 0; u <= 7; u++) for (const x of [-2, 0, 2, 9]) {
      const { score } = rebaFromComponents(
        { trunk: t, neck: t, legs: t, upperArm: u, lowerArm: u, wrist: u },
        { load: x, coupling: x, activity: x },
      );
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(15);
    }
  });

  it('fronteras de los niveles de acción', () => {
    expect(rebaRiskLevel(1)).toBe('inapreciable');
    expect(rebaRiskLevel(2)).toBe('bajo');
    expect(rebaRiskLevel(3)).toBe('bajo');
    expect(rebaRiskLevel(4)).toBe('medio');
    expect(rebaRiskLevel(7)).toBe('medio');
    expect(rebaRiskLevel(8)).toBe('alto');
    expect(rebaRiskLevel(10)).toBe('alto');
    expect(rebaRiskLevel(11)).toBe('muy alto');
    expect(rebaRiskLevel(15)).toBe('muy alto');
  });

  it('puntuaciones parciales a partir de ángulos', () => {
    expect([0, 5, 6, 20, 21, 60, 61].map(a => rebaTrunkScore(a))).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(rebaTrunkScore(70, true)).toBe(3);        // extensión > 20° → 3
    expect([0, 20, 21].map(rebaNeckScore)).toEqual([1, 1, 2]);
    expect([null, 0, 29, 30, 60, 61].map(rebaLegsScore)).toEqual([1, 1, 1, 2, 2, 3]);
    expect([0, 20, 21, 45, 46, 90, 91].map(a => rebaUpperArmScore(a))).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(rebaUpperArmScore(60, true)).toBe(2);     // extensión > 20° → 2
    expect([59, 60, 100, 101].map(rebaLowerArmScore)).toEqual([2, 1, 1, 2]);
    expect([null, 15, 16].map(rebaWristScore)).toEqual([1, 1, 2]);
  });
});

// ── 3. REBA desde landmarks ───────────────────────────────────────────────────

describe('calculateREBA desde landmarks sintéticos', () => {
  it('postura neutra de perfil → 1 (inapreciable)', () => {
    const r = calculateREBA(sidePose())!;
    expect(r.components).toEqual({ trunk: 1, neck: 1, legs: 1, upperArm: 1, lowerArm: 1, wrist: 1 });
    expect(r.score).toBe(1);
    expect(r.risk).toBe('inapreciable');
    expect(r.legsAssumed).toBe(false);
  });

  it('postura flexionada conocida → componentes y puntuación esperados', () => {
    const r = calculateREBA(sidePose({ trunk: 40, neck: 30, upperArm: 70, elbow: 30, wrist: 25, knee: 45 }))!;
    expect(r.angles.trunk).toBe(40);
    expect(r.angles.upperArm).toBe(70);
    expect(r.angles.elbow).toBe(30);
    expect(r.angles.knee).toBe(45);
    expect(r.components).toEqual({ trunk: 3, neck: 2, legs: 2, upperArm: 3, lowerArm: 2, wrist: 2 });
    // Tabla A[cuello 2][tronco 3][piernas 2] = 5; Tabla B[antebrazo 2][brazo 3][muñeca 2] = 5; Tabla C[5][5] = 6
    expect(r.scoreA).toBe(5);
    expect(r.scoreB).toBe(5);
    expect(r.score).toBe(6);
    expect(r.risk).toBe('medio');
  });

  it('distingue flexión y extensión según hacia dónde mira el operario', () => {
    for (const facing of [1, -1] as const) {
      const r = calculateREBA(sidePose({ trunk: -30, upperArm: -40, facing }))!;
      expect(r.components.trunk).toBe(3);    // extensión de tronco > 20°
      expect(r.components.upperArm).toBe(2); // extensión de brazo > 20°
    }
  });

  it('piernas no visibles → se asumen neutras con confianza baja', () => {
    const pose = sidePose({ knee: 80 });
    for (const i of [25, 26, 27, 28]) pose[i] = { ...pose[i], visibility: 0.1 };
    const r = calculateREBA(pose)!;
    expect(r.legsAssumed).toBe(true);
    expect(r.components.legs).toBe(1);
    expect(r.angles.knee).toBeNull();
    expect(r.confidence.piernas.assumed).toBe(true);
    expect(r.confidence.piernas.level).toBe('baja');
  });

  it('analiza el brazo más visible', () => {
    const pose = sidePose({ visibility: 1, farVisibility: 0.95 });
    for (const i of [11, 13, 15]) pose[i] = { ...pose[i], visibility: 0.2 };
    expect(calculateREBA(pose)!.side).toBe('derecho');
    expect(calculateREBA(sidePose())!.side).toBe('izquierdo');
  });

  it('pose incompleta → null', () => {
    expect(calculateREBA([])).toBeNull();
    expect(calculateREBA(makePose({}).slice(0, 20))).toBeNull();
  });
});

// ── 4. Confianza por segmento ─────────────────────────────────────────────────

describe('confianza por segmento', () => {
  it('disminuye al bajar la visibilidad de los landmarks', () => {
    const segs = ['cuello', 'tronco', 'brazo', 'antebrazo', 'muneca', 'piernas'] as const;
    for (const seg of segs) {
      const values = [1, 0.9, 0.7, 0.5, 0.3, 0.1].map(v => segmentConfidence(seg, v, 'lateral').value);
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
      expect(values[0]).toBeGreaterThan(values[values.length - 1]);
    }
    expect(visibilityScore(0.2)).toBe(0);
    expect(visibilityScore(0.95)).toBe(1);
  });

  it('con la pose completa, la confianza baja cuando la pose es menos visible', () => {
    const hi = computeSegmentConfidences(sidePose({ visibility: 1 }), 'izquierdo', 'lateral');
    const lo = computeSegmentConfidences(sidePose({ visibility: 0.55, farVisibility: 0.5 }), 'izquierdo', 'lateral');
    for (const seg of Object.keys(hi) as (keyof typeof hi)[]) expect(lo[seg].value).toBeLessThan(hi[seg].value);
  });

  it('refleja la fiabilidad conocida: tronco > brazo > cuello/antebrazo > muñeca', () => {
    expect(SEGMENT_RELIABILITY.tronco).toBeGreaterThan(SEGMENT_RELIABILITY.brazo);
    expect(SEGMENT_RELIABILITY.brazo).toBeGreaterThan(SEGMENT_RELIABILITY.cuello);
    expect(SEGMENT_RELIABILITY.antebrazo).toBeGreaterThan(SEGMENT_RELIABILITY.muneca);
    expect(segmentConfidence('tronco', 1, 'lateral').level).toBe('alta');
    expect(segmentConfidence('muneca', 1, 'lateral').level).not.toBe('alta');
    expect(segmentConfidence('cuello', 1, 'lateral').level).not.toBe('alta');
  });

  it('la vista frontal reduce la confianza respecto a la lateral', () => {
    expect(segmentConfidence('tronco', 1, 'frontal').value).toBeLessThan(segmentConfidence('tronco', 1, 'lateral').value);
    expect(segmentConfidence('cuello', 1, 'frontal').level).toBe('baja');
  });
});

// ── 5. Vista de la cámara ─────────────────────────────────────────────────────

describe('detección de vista lateral vs frontal', () => {
  it('perfil → lateral', () => {
    const v = estimateCameraView(sidePose());
    expect(v.view).toBe('lateral');
    expect(v.ratio).toBeLessThan(0.25);
  });

  it('de frente → frontal', () => {
    const v = estimateCameraView(frontPose());
    expect(v.view).toBe('frontal');
    expect(v.ratio).toBeGreaterThan(0.45);
  });

  it('hombros a media distancia → oblicua', () => {
    const p = frontPose();
    p[11] = { ...p[11], x: 0.5 - 0.05 / DEFAULT_ASPECT };
    p[12] = { ...p[12], x: 0.5 + 0.05 / DEFAULT_ASPECT };
    expect(estimateCameraView(p).view).toBe('oblicua');
  });

  it('sin hombros visibles o pose vacía → desconocida', () => {
    expect(estimateCameraView([]).view).toBe('desconocida');
    expect(estimateCameraView(frontPose(0.1)).view).toBe('desconocida');
  });
});

// ── 6. Regresión RULA ─────────────────────────────────────────────────────────
// Valores esperados obtenidos con calculateRULA ANTES de añadir confianza/vista/REBA.

describe('RULA sin cambios (regresión)', () => {
  const FRONTAL = makePose({ 0: [0.5, 0.15], 11: [0.42, 0.3], 12: [0.58, 0.3], 13: [0.40, 0.45], 14: [0.60, 0.45], 15: [0.40, 0.58], 16: [0.60, 0.58], 19: [0.40, 0.63], 20: [0.60, 0.63], 23: [0.45, 0.6], 24: [0.55, 0.6], 25: [0.45, 0.78], 26: [0.55, 0.78], 27: [0.45, 0.95], 28: [0.55, 0.95] });
  const LATERAL = makePose({ 0: [0.32, 0.30], 11: [0.40, 0.35, -0.1], 12: [0.42, 0.35, 0.1], 13: [0.33, 0.48], 14: [0.35, 0.48], 15: [0.25, 0.55], 16: [0.27, 0.55], 19: [0.22, 0.58], 20: [0.24, 0.58], 23: [0.55, 0.6], 24: [0.56, 0.6], 25: [0.50, 0.78], 26: [0.51, 0.78], 27: [0.55, 0.95], 28: [0.56, 0.95] });
  const MID = makePose({ 0: [0.53, 0.15], 11: [0.42, 0.3], 12: [0.58, 0.3], 13: [0.495, 0.43], 15: [0.615, 0.43], 23: [0.40, 0.6], 24: [0.50, 0.6] });

  const cases: [string, number, Landmark[], object][] = [
    ['frontal', 1, FRONTAL,   { rula: 5, neckAngle: 0,  trunkAngle: 0,  upperArmAngle: 98,  forearmAngle: 172, wristAngle: 90,  risk: 'high' }],
    ['frontal', 1.1, FRONTAL, { rula: 5, neckAngle: 0,  trunkAngle: 0,  upperArmAngle: 98,  forearmAngle: 172, wristAngle: 90,  risk: 'high' }],
    ['lateral', 1, LATERAL,   { rula: 7, neckAngle: 60, trunkAngle: 30, upperArmAngle: 118, forearmAngle: 159, wristAngle: 139, risk: 'critical' }],
    ['lateral', 1.1, LATERAL, { rula: 7, neckAngle: 60, trunkAngle: 30, upperArmAngle: 118, forearmAngle: 159, wristAngle: 139, risk: 'critical' }],
    ['intermedia', 1, MID,    { rula: 4, neckAngle: 11, trunkAngle: 9,  upperArmAngle: 60,  forearmAngle: 120, wristAngle: 0,   risk: 'medium' }],
    ['intermedia', 1.1, MID,  { rula: 4, neckAngle: 11, trunkAngle: 9,  upperArmAngle: 60,  forearmAngle: 120, wristAngle: 0,   risk: 'medium' }],
    ['intermedia', 2, MID,    { rula: 6, neckAngle: 11, trunkAngle: 9,  upperArmAngle: 60,  forearmAngle: 120, wristAngle: 0,   risk: 'high' }],
  ];

  it.each(cases)('pose %s, rigor %s', (_name, strictness, pose, expected) => {
    expect(calculateRULA(pose, strictness)).toMatchObject(expected);
  });

  it('añade confianza, vista y REBA sin alterar los campos existentes', () => {
    const r = calculateRULA(sidePose({ trunk: 40 }));
    expect(r.confidence?.tronco.level).toBe('alta');
    expect(r.view?.view).toBe('lateral');
    expect(r.reba?.score).toBeGreaterThanOrEqual(1);
    expect(r.overallConfidence).toBeGreaterThan(0);
  });

  it('pose insuficiente → mismo resultado vacío que antes', () => {
    expect(calculateRULA([], 1)).toEqual({ rula: 1, neckAngle: 0, trunkAngle: 0, upperArmAngle: 0, forearmAngle: 0, wristAngle: 0, risk: 'low' });
  });
});

// ── 7. Interfaz ───────────────────────────────────────────────────────────────

describe('PostureAnalyzer — semáforo y guía de vista', () => {
  // Render mínimo con react-dom (sin @testing-library/dom).
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const renderPosture = (pose: Landmark[]) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(React.createElement(PostureAnalyzer, { posture: calculateRULA(pose), head: null, eyes: null })));
    return host.textContent ?? '';
  };
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null; host = null;
  });

  it('vista frontal: muestra la guía para grabar de perfil, REBA y el aviso de tamizaje', () => {
    const text = renderPosture(frontPose());
    expect(text).toMatch(/graba de lado \(perfil\)/i);
    expect(text).toMatch(/Tamizaje: confirma con un evaluador/i);
    expect(text).toContain('REBA');
    // Un punto de confianza por fila de ángulo (cuello, tronco, brazo, antebrazo, muñeca)
    const dots = host!.querySelectorAll('[data-confidence]');
    expect(dots).toHaveLength(5);
    dots.forEach(d => expect(d.getAttribute('title')).toMatch(/confianza (alta|media|baja)/));
  });

  it('vista lateral: no muestra la guía', () => {
    const text = renderPosture(sidePose());
    expect(text).not.toMatch(/graba de lado/i);
    expect(text).toContain('Lateral (perfil)');
  });
});
