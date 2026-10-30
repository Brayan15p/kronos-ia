/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Movimiento sintético de manos para probar el reconocimiento de pasos sin video real.
import type { Feature, FeatureFrame } from "@/lib/stepRecognition";

/** PRNG reproducible (Mulberry32) y normal de Box-Muller. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u());
  return { u, n };
}

// Método de 4 pasos: la mano izquierda recorre P0→P1→P2→P3→P4 y la derecha hace un gesto propio
// de cada paso (en anchos de hombro, como frameFeature).
export const STEPS = [1, 2, 3, 4].map((n) => ({ number: n, name: `Paso ${n}` }));
const P: [number, number][] = [[-0.8, 0.6], [0.2, 1.2], [0.9, 0.4], [0.1, -0.2], [-0.8, 0.6]];
const R: [number, number][] = [[0.6, 0.8], [1.2, 1.0], [0.4, 1.4], [1.0, 0.2]];
export const REF_DUR = [2, 3, 2.5, 2]; // s

/** Posición en el paso s con avance u ∈ [0, 1]. */
function pose(s: number, u: number): Feature {
  const [ax, ay] = P[s], [bx, by] = P[s + 1];
  const [rx, ry] = R[s];
  const wiggle = Math.sin(Math.PI * u) * 0.35;
  return [ax + (bx - ax) * u, ay + (by - ay) * u, rx + wiggle, ry - wiggle];
}

/**
 * Ciclo sintético a 30 fps. `steps` = pasos que se hacen (índices 0..3), `warp` = factor de duración
 * por paso. Entre pasos no contiguos (paso omitido) hay un traslado de 0,3 s.
 */
export function synth(steps: number[], warp: number[], noise: number, seed: number, t0 = 0) {
  const { n } = rng(seed);
  const frames: FeatureFrame[] = [];
  const truth: { step: number; start: number; end: number }[] = [];
  let t = t0;
  let prevEnd: Feature | null = null;
  const push = (f: Feature) => {
    frames.push({ t, f: f.map((v) => v + noise * n()) as Feature });
    t += 1000 / 30;
  };
  steps.forEach((s, i) => {
    const start = pose(s, 0);
    if (prevEnd && Math.hypot(prevEnd[0] - start[0], prevEnd[1] - start[1]) > 0.05) {
      for (let k = 0; k < 9; k++) {
        const w = (k + 1) / 10;
        push(prevEnd.map((v, j) => v + (start[j] - v) * w) as Feature);
      }
    }
    const dur = REF_DUR[s] * warp[i];
    const nFrames = Math.round(dur * 30);
    const begin = t;
    for (let k = 0; k < nFrames; k++) push(pose(s, k / (nFrames - 1)));
    truth.push({ step: s + 1, start: begin, end: t });
    prevEnd = pose(s, 1);
  });
  return { frames, truth };
}

