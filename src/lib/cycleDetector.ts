/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Detección automática de ciclos a partir del esqueleto (sin cronometrista).
//
// Idea: en un trabajo manual repetitivo las manos vuelven a una "posición inicial" al empezar
// cada ciclo (tomar la pieza, apoyar las manos en la mesa…). El usuario marca esa posición una
// vez y, desde ahí, cada salida de la zona inicial abre un ciclo nuevo y cierra el anterior.
// Se usa histéresis (radio de entrada < radio de salida) para que el temblor en el borde de
// la zona no genere ciclos falsos, y un mínimo de tiempo fuera para ignorar movimientos sueltos.

export interface Point {
  x: number;
  y: number;
}

export interface DetectedCycle {
  start: number;     // ms
  end: number;       // ms
  duration: number;  // s
}

export interface CycleDetectorOptions {
  /** Distancia (coordenadas normalizadas 0–1) para considerar que las manos volvieron a casa. */
  enterRadius: number;
  /** Distancia para considerar que las manos salieron de casa. Debe ser mayor que enterRadius. */
  exitRadius: number;
  /** Tiempo mínimo fuera de casa para contar la salida como trabajo real (ms). */
  minAwayMs: number;
  /** Ciclos más cortos que esto se descartan como ruido (ms). */
  minCycleMs: number;
  /** Si no se ven manos durante este tiempo, el ciclo en curso se descarta (ms). */
  maxGapMs: number;
}

export const DEFAULT_CYCLE_OPTIONS: CycleDetectorOptions = {
  enterRadius: 0.07,
  exitRadius: 0.11,
  minAwayMs: 600,
  minCycleMs: 2000,
  maxGapMs: 5000,
};

export type CycleDetectorState = "uncalibrated" | "home" | "away";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Punto representativo de las manos: el promedio de las muñecas visibles. */
export function handsCentroid(points: (Point | null | undefined)[]): Point | null {
  const visible = points.filter((p): p is Point => !!p);
  if (visible.length === 0) return null;
  return {
    x: visible.reduce((s, p) => s + p.x, 0) / visible.length,
    y: visible.reduce((s, p) => s + p.y, 0) / visible.length,
  };
}

export class CycleDetector {
  private opts: CycleDetectorOptions;
  private home: Point | null = null;
  private state: CycleDetectorState = "uncalibrated";
  private cycleStart: number | null = null;  // salida de casa que abrió el ciclo en curso
  private leftAt: number | null = null;      // salida de casa más reciente
  private lastSeen: number | null = null;

  constructor(opts: Partial<CycleDetectorOptions> = {}) {
    this.opts = { ...DEFAULT_CYCLE_OPTIONS, ...opts };
    if (this.opts.exitRadius <= this.opts.enterRadius) {
      throw new Error("exitRadius debe ser mayor que enterRadius");
    }
  }

  get status(): CycleDetectorState {
    return this.state;
  }

  get homePoint(): Point | null {
    return this.home;
  }

  /** Fija la posición inicial y reinicia el conteo. */
  setHome(point: Point): void {
    this.home = { ...point };
    this.state = "home";
    this.cycleStart = null;
    this.leftAt = null;
    this.lastSeen = null;
  }

  reset(): void {
    this.home = null;
    this.state = "uncalibrated";
    this.cycleStart = null;
    this.leftAt = null;
    this.lastSeen = null;
  }

  /**
   * Procesa un fotograma. Devuelve el ciclo que se cerró en este fotograma, si alguno.
   * @param t      marca de tiempo en ms (monótona)
   * @param point  centroide de las manos, o null si no se ven
   */
  update(t: number, point: Point | null): DetectedCycle | null {
    if (!this.home) return null;

    if (!point) {
      // Manos fuera de cámara demasiado tiempo: el ciclo en curso ya no es medible.
      if (this.lastSeen !== null && t - this.lastSeen > this.opts.maxGapMs) {
        this.cycleStart = null;
        this.leftAt = null;
        this.state = "home";
        this.lastSeen = null;
      }
      return null;
    }
    this.lastSeen = t;

    const d = dist(point, this.home);

    if (this.state === "home" && d > this.opts.exitRadius) {
      this.state = "away";
      this.leftAt = t;
      return null;
    }

    if (this.state === "away" && d < this.opts.enterRadius) {
      this.state = "home";
      const leftAt = this.leftAt;
      this.leftAt = null;
      // Movimiento demasiado corto (acomodar la mano, rascarse): no es un ciclo.
      if (leftAt === null || t - leftAt < this.opts.minAwayMs) return null;

      // Cada ciclo va de una vuelta a casa a la siguiente (el tiempo en casa, p. ej. tomar
      // la pieza, es parte del ciclo). El primero arranca en la primera salida para no
      // contar la espera antes de empezar a trabajar.
      const start = this.cycleStart ?? leftAt;
      this.cycleStart = t;
      const duration = t - start;
      if (duration < this.opts.minCycleMs) return null;
      return { start, end: t, duration: duration / 1000 };
    }

    return null;
  }
}
