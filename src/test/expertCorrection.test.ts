/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Revisión del experto (corrección manual de RULA/REBA).
 *
 * Los valores esperados se calculan a mano con las tablas publicadas:
 *  - RULA: McAtamney L, Corlett EN. Applied Ergonomics 1993; 24(2): 91–99 (Tablas A, B y C).
 *  - REBA: Hignett S, McAtamney L. Applied Ergonomics 2000; 31(2): 201–205 (Tablas A, B y C).
 * La notación «Tabla A[brazo 3][antebrazo 2][muñeca 3][giro 1]» indica la celda consultada.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_FACTORS, FACTOR_KEYS, REVIEW_SEGMENTS, VALIDATION_CSV_HEADERS, VALIDATION_STORAGE_KEY,
  recalcRULA, recalcREBA, rulaComponentsFrom, rebaComponentsFrom, createExpertReview, measuredAnglesFromPosture,
  toExpertValidation, correctedFields, agreementSummary, validationToCSV, parseExpertReview, parseValidationDataset,
  addToValidationDataset, loadValidationDataset, isWorsePosture,
  type ExpertFactors, type PostureAngles, type ExpertReview,
} from '@/components/VisionAI/expertReview';
import ExpertReviewPanel from '@/components/VisionAI/ExpertReviewPanel';
import { calculateRULA } from '@/components/VisionAI/utils';
import { DEFAULT_ASPECT } from '@/components/VisionAI/ergonomics';
import type { Landmark, PostureScore } from '@/components/VisionAI/types';
import { buildMatrix, matrixToCSV, MATRIX_CSV_HEADERS, type ErgoEvaluation, type ExpertValidation } from '@/lib/sgsst';
import { parseSGSST } from '@/lib/sgsstStore';
import { buildSGSSTPdf } from '@/lib/sgsstPdf';

const angles = (a: Partial<PostureAngles> = {}): PostureAngles => ({
  tronco: 0, cuello: 0, brazo: 0, antebrazo: 80, muneca: 0, piernas: 0, ...a,
});
const factors = (f: Partial<ExpertFactors> = {}): ExpertFactors => ({ ...DEFAULT_FACTORS, ...f });

const review = (measured: PostureAngles, corrected: PostureAngles, f: Partial<ExpertFactors> = {}, over: Partial<{ id: string; reviewer: string; note: string; puesto: string }> = {}): ExpertReview =>
  createExpertReview({
    id: over.id ?? Math.random().toString(36).slice(2), measured, angles: corrected, factors: factors(f),
    reviewer: over.reviewer ?? 'Ana Ruiz', date: '2026-10-30', note: over.note ?? '', puesto: over.puesto ?? 'Ensamble 2',
    createdAt: '2026-10-30T15:00:00Z',
  });

// ── 1. Recálculo con ángulos y factores corregidos ──────────────────────────

describe('recálculo de RULA desde ángulos corregidos (McAtamney y Corlett, 1993)', () => {
  // Tronco 30°, cuello 25°, brazo 70°, codo 120°, muñeca 20°, rodilla 0°.
  const a = angles({ tronco: 30, cuello: 25, brazo: 70, antebrazo: 120, muneca: 20, piernas: 0 });

  it('sin factores: RULA 4', () => {
    // Brazo 70° (45–90°) = 3 · antebrazo 120° (> 100°) = 2 · muñeca 20° (> 15°) = 3 · giro 1
    //   Tabla A[3][2][3][1] = 4
    // Cuello 25° (> 20°) = 3 · tronco 30° (20–60°) = 3 · piernas apoyadas = 1
    //   Tabla B[3][3][1] = 4
    // C = 4 + 0 + 0 = 4 · D = 4 + 0 + 0 = 4 → Tabla C[4][4] = 4
    const r = recalcRULA(a, DEFAULT_FACTORS);
    expect(r.components).toEqual({ upperArm: 3, lowerArm: 2, wrist: 3, wristTwist: 1, neck: 3, trunk: 3, legs: 1 });
    expect([r.tableA, r.tableB, r.scoreC, r.scoreD, r.score]).toEqual([4, 4, 4, 4, 4]);
    expect(r.risk).toBe('medium');
  });

  it('con hombro elevado, giro al final del rango, uso muscular y carga 2–10 kg estática: RULA 7', () => {
    // Brazo 3 + 1 (hombro elevado) = 4 · antebrazo 2 · muñeca 3 · giro 2
    //   Tabla A[4][2][3][2] = 5
    // Tabla B[3][3][1] = 4 (sin cambios)
    // C = 5 + 1 (uso muscular) + 2 (fuerza) = 8 · D = 4 + 1 + 2 = 7 → Tabla C[8+][7+] = 7
    const r = recalcRULA(a, factors({ shoulderRaised: true, wristTwist: 2, muscleUse: 1, rulaForce: 2 }));
    expect(r.components.upperArm).toBe(4);
    expect(r.components.wristTwist).toBe(2);
    expect([r.tableA, r.tableB, r.scoreC, r.scoreD, r.score]).toEqual([5, 4, 8, 7, 7]);
    expect(r.risk).toBe('critical');
  });

  it('cuello en extensión (ángulo negativo) puntúa 4', () => {
    // Cuello −15° (extensión) = 4 · tronco erguido = 1 · piernas 1 → Tabla B[4][1][1] = 5
    // Brazo 0° = 1 · antebrazo 80° = 1 · muñeca 0° = 1 · giro 1 → Tabla A[1][1][1][1] = 1
    // C = 1 · D = 5 → Tabla C[1][5] = 4
    const r = recalcRULA(angles({ cuello: -15 }));
    expect(r.components.neck).toBe(4);
    expect([r.tableA, r.tableB, r.score]).toEqual([1, 5, 4]);
  });
});

describe('recálculo de REBA desde ángulos corregidos (Hignett y McAtamney, 2000)', () => {
  const a = angles({ tronco: 30, cuello: 25, brazo: 70, antebrazo: 120, muneca: 20, piernas: 0 });

  it('sin factores: REBA 5', () => {
    // Tronco 30° (20–60°) = 3 · cuello 25° (> 20°) = 2 · piernas (apoyo bilateral, rodilla 0°) = 1
    //   Tabla A[cuello 2][tronco 3][piernas 1] = 4 · carga 0 → Puntuación A = 4
    // Brazo 70° = 3 · antebrazo 120° = 2 · muñeca 20° (> 15°) = 2
    //   Tabla B[antebrazo 2][brazo 3][muñeca 2] = 5 · agarre 0 → Puntuación B = 5
    // Tabla C[4][5] = 5 · actividad 0 → REBA 5 (riesgo medio)
    const r = recalcREBA(a, DEFAULT_FACTORS);
    expect(r.components).toEqual({ trunk: 3, neck: 2, legs: 1, upperArm: 3, lowerArm: 2, wrist: 2 });
    expect([r.scoreA, r.scoreB, r.tableC, r.score]).toEqual([4, 5, 5, 5]);
    expect(r.risk).toBe('medio');
  });

  it('con tronco girado, carga > 10 kg, agarre malo y una condición de actividad: REBA 10', () => {
    // Tronco 3 + 1 (girado) = 4 → Tabla A[2][4][1] = 5 · + carga 2 → A = 7
    // Tabla B[2][3][2] = 5 · + agarre 2 → B = 7
    // Tabla C[7][7] = 9 · + actividad 1 → REBA 10 (riesgo alto)
    const r = recalcREBA(a, factors({ trunkTwisted: true, rebaLoad: 2, coupling: 2, activity: 1 }));
    expect(r.components.trunk).toBe(4);
    expect([r.scoreA, r.scoreB, r.tableC, r.score]).toEqual([7, 7, 9, 10]);
    expect(r.risk).toBe('alto');
  });

  it('tronco en extensión > 20° puntúa 3 y la rodilla flexionada suma a piernas', () => {
    // Tronco −30° (extensión > 20°) = 3 · cuello 0° = 1 · rodilla 45° (30–60°) → piernas 1 + 1 = 2
    //   Tabla A[1][3][2] = 4
    const r = recalcREBA(angles({ tronco: -30, piernas: 45 }));
    expect(r.components.trunk).toBe(3);
    expect(r.components.legs).toBe(2);
    expect(r.scoreA).toBe(4);
  });
});

// ── 2. Los factores de ajuste suben (o bajan) la puntuación como dice el método ──

describe('factores de ajuste', () => {
  const base = angles({ tronco: 30, cuello: 15, brazo: 70, antebrazo: 80, muneca: 10, piernas: 0 });
  const rula0 = rulaComponentsFrom(base, DEFAULT_FACTORS);
  const reba0 = rebaComponentsFrom(base, DEFAULT_FACTORS);

  it('brazo: +1 hombro elevado, +1 abducción, −1 apoyado (RULA y REBA)', () => {
    expect(rula0.upperArm).toBe(3);
    expect(rulaComponentsFrom(base, factors({ shoulderRaised: true })).upperArm).toBe(4);
    expect(rulaComponentsFrom(base, factors({ armAbducted: true })).upperArm).toBe(4);
    expect(rulaComponentsFrom(base, factors({ shoulderRaised: true, armAbducted: true })).upperArm).toBe(5);
    expect(rulaComponentsFrom(base, factors({ armSupported: true })).upperArm).toBe(2);
    expect(rebaComponentsFrom(base, factors({ shoulderRaised: true, armAbducted: true })).upperArm).toBe(reba0.upperArm + 2);
    expect(rebaComponentsFrom(base, factors({ armSupported: true })).upperArm).toBe(reba0.upperArm - 1);
    // Nunca baja de 1: brazo neutro (1) apoyado sigue en 1.
    expect(rulaComponentsFrom(angles(), factors({ armSupported: true })).upperArm).toBe(1);
  });

  it('cuello y tronco: RULA suma giro e inclinación por separado; REBA suma 1 por cualquiera de los dos', () => {
    const both = factors({ neckTwisted: true, neckSideBent: true, trunkTwisted: true, trunkSideBent: true });
    expect(rulaComponentsFrom(base, both).neck).toBe(rula0.neck + 2);
    expect(rulaComponentsFrom(base, both).trunk).toBe(rula0.trunk + 2);
    expect(rebaComponentsFrom(base, both).neck).toBe(reba0.neck + 1);
    expect(rebaComponentsFrom(base, both).trunk).toBe(reba0.trunk + 1);
    expect(rebaComponentsFrom(base, factors({ neckSideBent: true })).neck).toBe(reba0.neck + 1);
  });

  it('muñeca: desviación +1 en ambos; giro al final del rango → giro 2 en RULA y +1 en REBA', () => {
    expect(rulaComponentsFrom(base, factors({ wristDeviated: true })).wrist).toBe(rula0.wrist + 1);
    expect(rebaComponentsFrom(base, factors({ wristDeviated: true })).wrist).toBe(reba0.wrist + 1);
    expect(rulaComponentsFrom(base, factors({ wristTwist: 2 })).wristTwist).toBe(2);
    expect(rebaComponentsFrom(base, factors({ wristTwist: 2 })).wrist).toBe(reba0.wrist + 1);
    // REBA: desviación y giro juntos siguen sumando 1.
    expect(rebaComponentsFrom(base, factors({ wristTwist: 2, wristDeviated: true })).wrist).toBe(reba0.wrist + 1);
  });

  it('antebrazo cruzando la línea media (+1 RULA) y piernas sin apoyo (RULA 2, REBA +1)', () => {
    expect(rulaComponentsFrom(base, factors({ lowerArmMidline: true })).lowerArm).toBe(rula0.lowerArm + 1);
    expect(rulaComponentsFrom(base, factors({ legsUnsupported: true })).legs).toBe(2);
    expect(rebaComponentsFrom(base, factors({ legsUnsupported: true })).legs).toBe(reba0.legs + 1);
  });

  it('uso muscular y fuerza suman a C y D (RULA); carga a A, agarre a B y actividad al final (REBA)', () => {
    const r0 = recalcRULA(base), r1 = recalcRULA(base, factors({ muscleUse: 1, rulaForce: 3 }));
    expect(r1.scoreC - r0.scoreC).toBe(4);
    expect(r1.scoreD - r0.scoreD).toBe(4);
    const b0 = recalcREBA(base);
    expect(recalcREBA(base, factors({ rebaLoad: 3 })).scoreA - b0.scoreA).toBe(3);
    expect(recalcREBA(base, factors({ coupling: 3 })).scoreB - b0.scoreB).toBe(3);
    expect(recalcREBA(base, factors({ activity: 2 })).score - b0.score).toBe(2);
  });

  it('ningún factor agravante baja la puntuación final (y apoyar el brazo no la sube)', () => {
    const sets = [base, angles(), angles({ tronco: 70, cuello: -10, brazo: 100, antebrazo: 30, muneca: 30, piernas: 70 })];
    for (const a of sets) {
      const r0 = recalcRULA(a).score, b0 = recalcREBA(a).score;
      for (const k of FACTOR_KEYS) {
        if (k === 'armSupported') {
          expect(recalcRULA(a, factors({ armSupported: true })).score).toBeLessThanOrEqual(r0);
          expect(recalcREBA(a, factors({ armSupported: true })).score).toBeLessThanOrEqual(b0);
          continue;
        }
        const on = factors({ [k]: typeof DEFAULT_FACTORS[k] === 'boolean' ? true : k === 'wristTwist' ? 2 : 3 } as Partial<ExpertFactors>);
        expect(recalcRULA(a, on).score, `${k} RULA`).toBeGreaterThanOrEqual(r0);
        expect(recalcREBA(a, on).score, `${k} REBA`).toBeGreaterThanOrEqual(b0);
      }
    }
  });
});

// ── 3. Coherencia con la estimación de la cámara ────────────────────────────

const rad = (d: number) => (d * Math.PI) / 180;

/** Operario de perfil con ángulos conocidos (mismo método que ergonomics.test.ts). */
function sidePose(o: { trunk?: number; neck?: number; upperArm?: number; elbow?: number; wrist?: number; knee?: number } = {}): Landmark[] {
  const { trunk = 0, neck = 0, upperArm = 0, elbow = 80, wrist = 0, knee = 0 } = o;
  const dirDown = (b: number) => ({ x: Math.sin(rad(b)), y: Math.cos(rad(b)) });
  const add = (p: { x: number; y: number }, d: { x: number; y: number }, len: number) => ({ x: p.x + d.x * len, y: p.y + d.y * len });
  const hip = { x: 0.6, y: 0.55 };
  const shoulder = add(hip, dirDown(180 - trunk), 0.3);
  const ear = add(shoulder, dirDown(180 - trunk - neck), 0.14);
  const nose = { x: ear.x + 0.05, y: ear.y + 0.01 };
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
  put(0, nose, 1);
  for (const key of Object.keys(L) as (keyof typeof L)[]) {
    const p = key === 'pinky' || key === 'index' ? near.hand : near[key];
    put(L[key], p, 1);
    put(R[key], p, 0.9, 0.015);
  }
  return pose;
}

describe('sin correcciones, el experto coincide con la cámara', () => {
  const cases = [
    {},
    { trunk: 30, neck: 25, upperArm: 70, elbow: 30, wrist: 25, knee: 45 },
    { trunk: -30, upperArm: -40 },
    { trunk: 10, neck: 15, upperArm: 30, elbow: 120, wrist: 10, knee: 75 },
  ];

  it.each(cases)('pose de perfil %o', (c) => {
    const p = calculateRULA(sidePose(c));
    const measured = measuredAnglesFromPosture(p);
    expect(recalcRULA(measured).score).toBe(p.rula);
    expect(recalcREBA(measured).score).toBe(p.reba!.score);
    const r = review(measured, measured);
    expect(r.overriddenAngles).toEqual([]);
    expect(r.overriddenFactors).toEqual([]);
    expect(r.expert.rula).toBe(r.camera.rula);
    expect(r.expert.reba).toBe(r.camera.reba);
    expect(correctedFields(r)).toEqual([]);
  });

  it('la extensión medida se conserva con signo negativo', () => {
    const m = measuredAnglesFromPosture(calculateRULA(sidePose({ trunk: -30, upperArm: -40 })));
    expect(m.tronco!).toBeLessThan(0);
    expect(m.brazo!).toBeLessThan(0);
  });

  it('postura antigua sin «extension» ni detalle: ángulos sin signo y muñeca medida', () => {
    const old: PostureScore = { rula: 3, neckAngle: 12, trunkAngle: 8, upperArmAngle: 40, forearmAngle: 90, wristAngle: 7, risk: 'medium' };
    expect(measuredAnglesFromPosture(old)).toEqual({ tronco: 8, cuello: 12, brazo: 40, antebrazo: 90, muneca: 7, piernas: null });
  });

  it('la postura crítica prefiere confianza aceptable y luego mayor RULA', () => {
    const p = (rula: number, conf: number, reba = 1): PostureScore =>
      ({ rula, neckAngle: 0, trunkAngle: 0, upperArmAngle: 0, forearmAngle: 0, wristAngle: 0, risk: 'low', overallConfidence: conf, reba: { score: reba } as PostureScore['reba'] });
    expect(isWorsePosture(p(3, 0.7), null)).toBe(true);
    expect(isWorsePosture(p(5, 0.7), p(3, 0.7))).toBe(true);
    expect(isWorsePosture(p(7, 0.1), p(3, 0.7))).toBe(false); // fotograma ruidoso
    expect(isWorsePosture(p(5, 0.7, 9), p(5, 0.7, 6))).toBe(true);
  });
});

// ── 4. Registro de la revisión y persistencia ───────────────────────────────

describe('registro de la revisión', () => {
  it('marca los campos corregidos y los describe', () => {
    const m = angles({ tronco: 10, muneca: 8 });
    const r = review(m, { ...m, muneca: 25 }, { shoulderRaised: true, rebaLoad: 1 }, { note: 'Muñeca vista en persona' });
    expect(r.overriddenAngles).toEqual(['muneca']);
    expect(r.overriddenFactors).toEqual(['shoulderRaised', 'rebaLoad']);
    expect(correctedFields(r)).toEqual([
      'Muñeca: de 8° a 25°',
      'Hombro elevado (RULA y REBA): sí',
      'Carga / fuerza (REBA): 5–10 kg',
    ]);
    const v = toExpertValidation(r);
    expect(v).toMatchObject({ rula: r.expert.rula, reba: r.expert.reba, rulaCamara: r.camera.rula, rebaCamara: r.camera.reba, revisor: 'Ana Ruiz', fecha: '2026-10-30', nota: 'Muñeca vista en persona' });
    expect(v.campos).toHaveLength(3);
  });

  it('una diferencia menor de medio grado no cuenta como corrección', () => {
    const m = angles({ tronco: 10.2 });
    expect(review(m, { ...m, tronco: 10 }).overriddenAngles).toEqual([]);
  });
});

describe('persistencia y compatibilidad con datos guardados', () => {
  beforeEach(() => localStorage.clear());

  it('el conjunto de validación se guarda, se reemplaza por id y tolera datos dañados', () => {
    const m = angles({ tronco: 30 });
    const r = review(m, { ...m, tronco: 45 }, {}, { id: 'r1' });
    addToValidationDataset(r);
    addToValidationDataset({ ...r, note: 'editada' });
    const list = loadValidationDataset();
    expect(list).toHaveLength(1);
    expect(list[0].note).toBe('editada');
    expect(list[0].expert).toEqual(r.expert);

    expect(parseValidationDataset('{no es json')).toEqual([]);
    expect(parseValidationDataset('{"a":1}')).toEqual([]);
    expect(parseValidationDataset(JSON.stringify([null, { id: 'x' }, 7]))).toEqual([]);
  });

  it('al leer se recalculan las puntuaciones y se completan los factores que falten', () => {
    const m = angles({ tronco: 30, cuello: 25, brazo: 70, antebrazo: 120, muneca: 20 });
    const tampered = { ...review(m, m, { shoulderRaised: true }, { id: 'r2' }), expert: { rula: 1, reba: 1 }, factors: { shoulderRaised: true } };
    const r = parseExpertReview(JSON.parse(JSON.stringify(tampered)))!;
    expect(r.factors).toEqual(factors({ shoulderRaised: true }));
    expect(r.expert.rula).toBe(recalcRULA(m, factors({ shoulderRaised: true })).score);
    expect(r.overriddenFactors).toEqual(['shoulderRaised']);
  });

  it('evaluaciones SG-SST antiguas (sin «experto») cargan igual que antes', () => {
    const old = {
      evaluations: [{
        id: 'e1', puesto: 'Corte', operario: '', fecha: '2026-01-10', rulaAvg: 5, rulaMax: 6, rebaAvg: 7, rebaMax: 9,
        confianza: 0.5, vista: 'lateral', notas: '', origen: 'vision-ai', muestras: 10, cicloSeg: 30, horasExposicion: 8, createdAt: 'x',
      }],
    };
    const s = parseSGSST(JSON.stringify(old));
    expect(s.evaluations).toHaveLength(1);
    expect('experto' in s.evaluations[0]).toBe(false);
    expect(s.evaluations[0]).toEqual(old.evaluations[0]);
  });

  it('la revisión del experto viaja con la evaluación y una revisión dañada se descarta sin perder la evaluación', () => {
    const experto: ExpertValidation = {
      rula: 6, reba: 9, rulaCamara: 4, rebaCamara: 5, revisor: 'Ana Ruiz', fecha: '2026-10-30', nota: 'ok', campos: ['Muñeca: de 8° a 25°'],
    };
    const base = {
      id: 'e1', puesto: 'Corte', operario: '', fecha: '2026-10-30', rulaAvg: 4, rulaMax: 5, rebaAvg: 5, rebaMax: 6,
      confianza: 0.6, vista: 'lateral', notas: '', origen: 'vision-ai', muestras: 10, cicloSeg: 30, horasExposicion: 8, createdAt: 'x',
    };
    const ok = parseSGSST(JSON.stringify({ evaluations: [{ ...base, experto }] }));
    expect(ok.evaluations[0].experto).toEqual(experto);
    // Cámara y experto conviven: rulaAvg sigue siendo el de la cámara.
    expect(ok.evaluations[0].rulaAvg).toBe(4);

    const bad = parseSGSST(JSON.stringify({ evaluations: [{ ...base, experto: { rula: 12, reba: 'x' } }] }));
    expect(bad.evaluations).toHaveLength(1);
    expect(bad.evaluations[0].experto).toBeUndefined();

    const partial = parseSGSST(JSON.stringify({ evaluations: [{ ...base, experto: { rula: 3, reba: 4 } }] }));
    expect(partial.evaluations[0].experto).toEqual({ rula: 3, reba: 4, rulaCamara: null, rebaCamara: null, revisor: '', fecha: '', nota: '', campos: [] });
  });
});

// ── 5. La propuesta GTC 45 usa el valor del experto ─────────────────────────

/** Lector mínimo de CSV con «;» y comillas dobles (como lo escribe toCSV). */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe('propuesta GTC 45 con revisión del experto', () => {
  const evaluation = (over: Partial<ErgoEvaluation> = {}): ErgoEvaluation => ({
    id: 'e1', puesto: 'Ensamble 2', operario: '', fecha: '2026-10-30',
    rulaAvg: 2, rulaMax: 3, rebaAvg: 3, rebaMax: 3, confianza: 0.2, vista: 'frontal', notas: '',
    origen: 'vision-ai', muestras: 12, cicloSeg: 25, horasExposicion: 8, createdAt: '2026-10-30T15:00:00Z',
    ...over,
  });
  const experto: ExpertValidation = {
    rula: 7, reba: 10, rulaCamara: 2, rebaCamara: 3, revisor: 'Ana Ruiz', fecha: '2026-10-31', nota: '', campos: [],
  };
  const postura = (e: ErgoEvaluation) => buildMatrix({ evaluations: [e], readings: [], overrides: {} }).find(r => r.hazard === 'postura')!;

  it('sin revisión se usa la cámara (RULA 2, REBA 3 → ND Bajo) y la confianza baja queda señalada', () => {
    const row = postura(evaluation());
    expect(row.proposed.nd).toBe(0);
    expect(row.validadoExperto).toBe(false);
    expect(row.lowConfidence).toBe(true);
  });

  it('con revisión se usa el experto (RULA 7 → ND 10), la fila queda «validado por experto» y se citan ambos valores', () => {
    const row = postura(evaluation({ experto }));
    // RULA 7 → ND Muy alto (10); REBA 10 → ND Alto (6); se toma el mayor.
    expect(row.proposed.nd).toBe(10);
    expect(row.validadoExperto).toBe(true);
    expect(row.lowConfidence).toBe(false);
    expect(row.fuente).toContain('validado por experto (Ana Ruiz, 2026-10-31)');
    expect(row.ndBasis).toContain('Validado por experto');
    expect(row.ndBasis).toContain('RULA 7');
    expect(row.ndBasis).toContain('Cámara (tamizaje): RULA prom. 2');
    // NR = ND 10 × NE 4 (8 h) × NC 25 = 1000 → nivel I.
    expect(row.nr).toBe(1000);
    expect(row.nrLevel).toBe('I');
  });

  it('el valor del experto también puede BAJAR la propuesta frente a la cámara', () => {
    const row = postura(evaluation({ rulaAvg: 7, rebaAvg: 11, experto: { ...experto, rula: 3, reba: 4 } }));
    expect(row.proposed.nd).toBe(2);
  });

  it('el CSV de la matriz marca la fila y el PDF incluye las columnas cámara / experto', () => {
    const e = evaluation({ experto });
    const rows = buildMatrix({ evaluations: [e], readings: [], overrides: {} });
    const table = parseCSV(matrixToCSV(rows).replace(/^\uFEFF/, ''));
    const col = MATRIX_CSV_HEADERS.indexOf('Validado por experto');
    expect(col).toBeGreaterThan(-1);
    expect(table[2][col]).toBe('Validado por experto');
    const posturaRow = table.find(r => r[2]?.startsWith('Postura'))!;
    expect(posturaRow[col]).toBe('Sí');

    const doc = buildSGSSTPdf({ cover: { empresa: '', planta: '', responsable: '', fecha: '' }, evaluations: [e, evaluation({ id: 'e2', puesto: 'Corte' })], rows, zones: [], readings: [], plan: [] });
    const out = doc.output();
    expect(out).toContain('Revisiones del experto');
    expect(out).toContain('Ana Ruiz');
    expect(out).toContain('Sin revisar');
    expect(out).not.toMatch(/\bcumple\b/i);
  });
});

// ── 6. Concordancia cámara vs experto ───────────────────────────────────────

describe('métricas de concordancia', () => {
  // r1: el experto confirma la cámara.
  const m1 = angles({ tronco: 10, cuello: 15, brazo: 30, antebrazo: 80, muneca: 10, piernas: 0 });
  const r1 = review(m1, m1, {}, { id: 'r1' });
  // r2: tronco +10°, cuello +20°, muñeca no visible para la cámara.
  const m2 = angles({ tronco: 30, cuello: 5, brazo: 50, antebrazo: 90, muneca: null, piernas: null });
  const r2 = review(m2, { ...m2, tronco: 40, cuello: 25, muneca: 20 }, {}, { id: 'r2' });
  // r3: codo de 70° a 110° y hombro elevado.
  const m3 = angles({ tronco: 0, cuello: 10, brazo: 20, antebrazo: 70, muneca: 5, piernas: 10 });
  const r3 = review(m3, { ...m3, antebrazo: 110 }, { shoulderRaised: true }, { id: 'r3' });

  it('puntuaciones de cada par calculadas a mano', () => {
    // r2 cámara RULA: brazo 3, antebrazo 1, muñeca 1 → Tabla A[3][1][1][1] = 3; cuello 1, tronco 3 → Tabla B[1][3][1] = 3; Tabla C[3][3] = 3
    // r2 experto RULA: muñeca 3 → Tabla A[3][1][3][1] = 4; cuello 3 → Tabla B[3][3][1] = 4; Tabla C[4][4] = 4
    // r2 cámara REBA: Tabla A[1][3][1] = 2; Tabla B[1][3][1] = 3; Tabla C[2][3] = 2
    // r2 experto REBA: cuello 2 → Tabla A[2][3][1] = 4; muñeca 2 → Tabla B[1][3][2] = 4; Tabla C[4][4] = 4
    // r3 cámara: todo neutro → RULA 1 y REBA 1
    // r3 experto RULA: brazo 1 + 1 = 2, antebrazo 2 → Tabla A[2][2][1][1] = 3; Tabla B = 1; Tabla C[3][1] = 3
    // r3 experto REBA: brazo 2, antebrazo 2, muñeca 1 → Tabla B[2][2][1] = 2; Tabla A = 1; Tabla C[1][2] = 1
    expect([r1.camera.rula, r1.expert.rula, r1.camera.reba, r1.expert.reba]).toEqual([r1.camera.rula, r1.camera.rula, r1.camera.reba, r1.camera.reba]);
    expect([r2.camera.rula, r2.expert.rula, r2.camera.reba, r2.expert.reba]).toEqual([3, 4, 2, 4]);
    expect([r3.camera.rula, r3.expert.rula, r3.camera.reba, r3.expert.reba]).toEqual([1, 3, 1, 1]);
  });

  it('DAM por segmento, % de acuerdo exacto de banda y concordancia de las puntuaciones finales', () => {
    const s = agreementSummary([r1, r2, r3]);
    expect(s.n).toBe(3);
    // Tronco: |0| + |10| + |0| = 10 / 3 = 3,3°; bandas RULA 2=2, 3=3, 1=1 → 100 %
    expect(s.segments.tronco).toEqual({ n: 3, madDeg: 3.3, exactPct: 100 });
    // Cuello: (0 + 20 + 0) / 3 = 6,7°; r2: 5° (banda 1) vs 25° (banda 3) → 2/3 = 67 %
    expect(s.segments.cuello).toEqual({ n: 3, madDeg: 6.7, exactPct: 67 });
    expect(s.segments.brazo).toEqual({ n: 3, madDeg: 0, exactPct: 100 });
    // Antebrazo: (0 + 0 + 40) / 3 = 13,3°; r3: 70° (1) vs 110° (2) → 67 %
    expect(s.segments.antebrazo).toEqual({ n: 3, madDeg: 13.3, exactPct: 67 });
    // Muñeca y piernas: r2 no tiene valor de cámara → solo 2 pares
    expect(s.segments.muneca).toEqual({ n: 2, madDeg: 0, exactPct: 100 });
    expect(s.segments.piernas).toEqual({ n: 2, madDeg: 0, exactPct: 100 });
    // RULA: diferencias 0, +1, +2 → DAM 1; exacto 1/3 = 33 %; ± 1: 2/3 = 67 %; sesgo +1 (la cámara subestima)
    expect(s.rula).toEqual({ n: 3, mad: 1, exactPct: 33, within1Pct: 67, meanDiff: 1 });
    // REBA: diferencias 0, +2, 0 → DAM 0,7; exacto 2/3 = 67 %; ± 1: 67 %; sesgo +0,7
    expect(s.reba).toEqual({ n: 3, mad: 0.7, exactPct: 67, within1Pct: 67, meanDiff: 0.7 });
  });

  it('conjunto vacío: sin cifras', () => {
    const s = agreementSummary([]);
    expect(s.n).toBe(0);
    expect(s.rula.mad).toBeNull();
    expect(s.segments.tronco).toEqual({ n: 0, madDeg: null, exactPct: null });
  });

  it('CSV de validación: BOM, preámbulo, columnas esperadas y valores por par', () => {
    const csv = validationToCSV([r1, r2, r3]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(3 + 1 + 3); // preámbulo + encabezados + 3 pares
    const header = lines[3].split(';');
    expect(header).toEqual(VALIDATION_CSV_HEADERS);
    for (const h of ['Fecha', 'Puesto', 'Revisó', 'RULA cámara', 'RULA experto', 'Diferencia RULA', 'REBA cámara', 'REBA experto', 'Diferencia REBA', 'Campos corregidos', 'Nota']) {
      expect(header).toContain(h);
    }
    for (const seg of ['Tronco', 'Cuello', 'Brazo superior', 'Antebrazo', 'Muñeca', 'Piernas']) {
      expect(header).toContain(`${seg} cámara (°)`);
      expect(header).toContain(`${seg} experto (°)`);
    }
    expect(header).toHaveLength(6 + REVIEW_SEGMENTS.length * 3 + 8);
    const row2 = lines[5].split(';');
    const col = (h: string) => row2[header.indexOf(h)];
    expect(col('Puesto')).toBe('Ensamble 2');
    expect(col('Revisó')).toBe('Ana Ruiz');
    expect(col('Muñeca cámara (°)')).toBe('');
    expect(col('Muñeca experto (°)')).toBe('20');
    expect(col('RULA cámara')).toBe('3');
    expect(col('RULA experto')).toBe('4');
    expect(col('Diferencia RULA')).toBe('1');
    expect(col('Diferencia REBA')).toBe('2');
    expect(col('Campos corregidos')).toBe('Tronco: de 30° a 40° | Cuello: de 5° a 25° | Muñeca: de no visible a 20°');
  });
});

// ── 7. Panel en la interfaz ─────────────────────────────────────────────────

describe('ExpertReviewPanel', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const setValue = (el: HTMLInputElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;

  it('captura la postura, recalcula al corregir y guarda la revisión en la sesión y en el conjunto de validación', () => {
    // React 18 + jsdom: habilita act() fuera de Testing Library.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const posture = calculateRULA(sidePose({ trunk: 30, neck: 25, upperArm: 70, elbow: 120, wrist: 25 }));
    const onSave = vi.fn();
    act(() => root.render(React.createElement(ExpertReviewPanel, { posture, criticalPosture: null, review: null, onSave, onClear: () => {} })));

    expect(container.textContent).toContain('tamizaje');
    expect(container.textContent).not.toMatch(/\bcumple\b/i);
    act(() => button('Revisar postura actual').click());

    const wrist = container.querySelector<HTMLInputElement>('input[aria-label="Ángulo de muñeca según el experto"]')!;
    expect(wrist).not.toBeNull();
    // Marca «hombro elevado» y escribe quién revisa.
    const shoulder = [...container.querySelectorAll('label')].find(l => l.textContent === 'Hombro elevado')!.querySelector('input')!;
    act(() => shoulder.click());
    act(() => setValue(container.querySelector<HTMLInputElement>('input[placeholder="Nombre del ergónomo"]')!, 'Ana Ruiz'));

    const rula = container.querySelector('[data-testid="compare-rula"]')!.textContent!;
    expect(rula).toContain('Cámara');
    expect(rula).toContain('Experto');

    act(() => button('Guardar revisión').click());
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved: ExpertReview = onSave.mock.calls[0][0];
    expect(saved.reviewer).toBe('Ana Ruiz');
    expect(saved.overriddenFactors).toEqual(['shoulderRaised']);
    expect(saved.expert.rula).toBeGreaterThanOrEqual(saved.camera.rula);
    expect(parseValidationDataset(localStorage.getItem(VALIDATION_STORAGE_KEY))).toHaveLength(1);
  });
});
