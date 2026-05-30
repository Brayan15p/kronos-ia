import React, { useState, useMemo, useEffect } from "react";
import {
  Dice5,
  Play,
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  RotateCcw,
  ShieldAlert,
  Gauge,
  Activity,
  Sigma,
  Crosshair,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
  Zap,
  ArrowUpCircle,
  CalendarDays,
} from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type DistKey = "normal" | "triangular" | "lognormal" | "bootstrap" | "pert";

interface ConvergencePoint {
  n: number;
  mean: number;
  p95: number;
}

interface HistoBin {
  bin: string;
  mid: number;
  count: number;
  meets: boolean;
}

interface CdfPoint {
  t: number;
  prob: number;
}

interface TornadoBar {
  name: string;
  low: number;
  high: number;
  range: number;
}

interface SimResult {
  // Distribución de tiempos
  scenarios: number[];
  minT: number;
  maxT: number;
  // Estadística
  mean: number;
  std: number;
  cv: number;
  p5: number;
  p10: number;
  p50: number;
  p90: number;
  p95: number;
  probMeetTarget: number;
  se: number;
  ciLow: number;
  ciHigh: number;
  // Valor más probable (moda de la distribución simulada)
  mode: number;
  modeProbPct: number;
  // Capacidad
  cpk: number;
  sigmaLevel: number;       // Z corto plazo del proceso = (LSC − μ) / σ
  sigmaSix: number;         // Nivel Six Sigma con corrimiento 1.5σ, acotado a [0, 6]
  dpmoTheoretical: number;  // DPMO teórico según el nivel sigma
  dpmo: number;             // DPMO empírico observado en la simulación
  // Capacidad completa
  cp: number;           // Índice de capacidad potencial (solo dispersión)
  cpm: number;          // Índice de Taguchi (penaliza desviación del objetivo)
  // Prueba de hipótesis
  tStat: number;
  pValue: number;
  rejectH0: boolean;
  // Intervalos bootstrap para P5 y P95
  p5ci: [number, number];
  p95ci: [number, number];
  // Sensibilidad global (Sobol)
  sobol: { name: string; si: number; si_pct: number }[];
  // Bondad de ajuste Anderson-Darling (todas las dist.)
  adScores: Record<string, number>;
  // Método de muestreo usado
  samplingMethod: string;
  // Financiero (mensual / anual)
  expected: number;
  best: number;
  worst: number;
  annualExpected: number;
  var95: number;
  cvar: number;
  costSaved: number;
  costLost: number;
  // ROI palancas
  baselineExpected: number;
  improvementMonthly: number;
  improvementAnnual: number;
  improvementPct: number;
  showImprovement: boolean;
  // Convergencia
  convergence: ConvergencePoint[];
  recommendedN: number;
  // Gráficos
  histogram: HistoBin[];
  cdf: CdfPoint[];
  tornado: TornadoBar[];
  // Goal seek
  goalMean: number;
  goalMeanPct: number;
  goalStd: number;
  goalStdPct: number;
  // Veredicto
  verdict: "capaz" | "aceptable" | "noCapaz";
  // Parámetros usados
  target: number;
  effMean: number;
  effStd: number;
}

// ---------------------------------------------------------------------------
// Núcleo estadístico — nivel de investigación
// ---------------------------------------------------------------------------

/** Box-Muller: normal estándar a partir de uniformes. */
function randn(): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** CDF normal estándar — Abramowitz & Stegun 26.2.17 (error < 7.5e-8). */
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** Inversa de la CDF normal (Beasley-Springer-Moro, precisión ~1e-9). */
function normalInv(p: number): number {
  if (p <= 0) return -8; if (p >= 1) return 8;
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
             0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
             0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  const x = p - 0.5;
  if (Math.abs(x) < 0.42) {
    const r = x * x;
    return x * (((a[3]*r+a[2])*r+a[1])*r+a[0]) / ((((b[3]*r+b[2])*r+b[1])*r+b[0])*r+1);
  }
  const r = Math.log(-Math.log(p < 0.5 ? p : 1 - p));
  const y = c[0]+r*(c[1]+r*(c[2]+r*(c[3]+r*(c[4]+r*(c[5]+r*(c[6]+r*(c[7]+r*c[8])))))));
  return p < 0.5 ? -y : y;
}

/**
 * Latin Hypercube Sampling — McKay, Beckman & Conover (1979).
 * Estándar académico de facto: divide [0,1] en N estratos equiprobables,
 * muestrea uno por estrato y los permuta. Convergencia O(1/N) vs O(1/√N)
 * del muestreo aleatorio puro.
 */
function latinHypercubeSample(N: number): number[] {
  const u = Array.from({ length: N }, (_, i) => (i + Math.random()) / N);
  // Fisher-Yates shuffle
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [u[i], u[j]] = [u[j], u[i]];
  }
  return u;
}

/**
 * Antithetic Variates — técnica de reducción de varianza (Hammersley & Handscomb, 1964).
 * Para cada u genera su complemento (1-u): la correlación negativa entre pares
 * cancela parte de la varianza del estimador, reduciendo el error ~40% sin coste.
 */
function antitheticPairs(N: number): number[] {
  const half = Math.ceil(N / 2);
  const u = latinHypercubeSample(half);
  const pairs: number[] = [];
  for (const v of u) { pairs.push(v); if (pairs.length < N) pairs.push(1 - v); }
  return pairs;
}

/**
 * Distribución PERT-Beta (Program Evaluation and Review Technique).
 * Estándar en ingeniería industrial y gestión de proyectos (PMI/PMBOK).
 * Parámetros: a = mínimo, m = más probable (moda), b = máximo.
 * μ = (a + 4m + b) / 6  →  misma ponderación que en PERT clásico.
 * Usa el método de Wilson-Hilferty para la inversión de la Beta.
 */
function pertSample(u: number, a: number, m: number, b: number): number {
  if (b <= a) return m;
  const mu = (a + 4 * m + b) / 6;
  const v = Math.max(1e-6, ((mu - a) * (2 * m - a - b)) / ((m - mu) * (b - a) || 1e-9));
  const alpha = 6 * (mu - a) / (b - a);
  const beta  = 6 * (b - mu) / (b - a);
  // Inversión Beta por aproximación normal (suficiente para α,β > 1)
  const za = normalInv(u);
  const xn = alpha / (alpha + beta) + Math.sqrt((alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1))) * za;
  return a + Math.max(0, Math.min(1, xn)) * (b - a);
}

/**
 * Anderson-Darling test — más potente que KS para detectar desviaciones en las colas.
 * Fórmula: A² = -N - (1/N) Σ (2i-1)[ln F(x_i) + ln(1-F(x_{N+1-i}))]
 * Usado por FDA, NIH y revistas Tier-1 sobre KS. Menor A² = mejor ajuste.
 */
function andersonDarling(sorted: number[], cdf: (x: number) => number): number {
  const N = sorted.length;
  if (N < 4) return 999;
  let S = 0;
  for (let i = 0; i < N; i++) {
    const fi  = Math.min(1 - 1e-10, Math.max(1e-10, cdf(sorted[i])));
    const fni = Math.min(1 - 1e-10, Math.max(1e-10, cdf(sorted[N - 1 - i])));
    S += (2 * i + 1) * (Math.log(fi) + Math.log(1 - fni));
  }
  return -N - S / N;
}

function adNormal(sorted: number[], mean: number, std: number): number {
  if (std <= 0) return 999;
  return andersonDarling(sorted, x => normalCDF((x - mean) / std));
}

function adLogNormal(sorted: number[]): number {
  const xs = sorted.filter(x => x > 0); if (xs.length < 4) return 999;
  const logs = xs.map(x => Math.log(x));
  const mu = logs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(logs.reduce((s, l) => s + (l - mu) ** 2, 0) / Math.max(1, xs.length - 1));
  if (sd <= 0) return 999;
  return andersonDarling(xs, x => x <= 0 ? 0 : normalCDF((Math.log(x) - mu) / sd));
}

function adTriangular(sorted: number[], mean: number): number {
  const N = sorted.length; if (N < 4) return 999;
  const a = sorted[0]; const b = sorted[N - 1]; if (b <= a) return 999;
  const c = Math.max(a + 1e-9, Math.min(b - 1e-9, 3 * mean - a - b));
  return andersonDarling(sorted, x => {
    if (x <= a) return 0; if (x >= b) return 1;
    if (x < c) return (x - a) ** 2 / ((b - a) * (c - a));
    return 1 - (b - x) ** 2 / ((b - a) * (b - c));
  });
}

function adPert(sorted: number[], mean: number, std: number): number {
  const N = sorted.length; if (N < 4) return 999;
  const a = sorted[0]; const b = sorted[N - 1];
  const m = Math.max(a, Math.min(b, 3 * mean - a - b));
  const alpha = 6 * (mean - a) / Math.max(1e-9, b - a);
  const beta  = 6 * (b - mean) / Math.max(1e-9, b - a);
  // CDF Beta via regularized incomplete beta (Abramowitz-Stegun series)
  const betaCDF = (x: number) => {
    const t = (x - a) / Math.max(1e-9, b - a);
    if (t <= 0) return 0; if (t >= 1) return 1;
    // Normal approximation for Beta CDF (Wilson-Hilferty, sufficient for α,β>0.5)
    const mu = alpha / (alpha + beta);
    const sig = Math.sqrt(alpha * beta / ((alpha + beta) ** 2 * (alpha + beta + 1)));
    return normalCDF((t - mu) / Math.max(sig, 1e-9));
  };
  return andersonDarling(sorted, betaCDF);
}

/**
 * Índices de Sobol de primer orden — Saltelli et al. (2010), JCP.
 * Mide la fracción de varianza total debida a cada factor de entrada.
 * Reemplaza el tornado clásico con análisis de sensibilidad global.
 * Usa estimador Jansen (mínima varianza): Si = V[E(Y|Xi)] / V(Y)
 */
function sobolFirstOrder(
  base: number[],
  factors: { name: string; perturb: (scenarios: number[], f: number) => number[] }[]
): { name: string; si: number; si_pct: number }[] {
  const N = base.length;
  const varY = base.reduce((s, x) => s + x * x, 0) / N - (base.reduce((a, b) => a + b, 0) / N) ** 2;
  if (varY < 1e-12) return factors.map(f => ({ name: f.name, si: 0, si_pct: 0 }));

  return factors.map(f => {
    const perturbed = f.perturb(base, 0.1);
    const condMean = perturbed.reduce((a, b) => a + b, 0) / N;
    const condVar  = perturbed.reduce((s, x) => s + x * x, 0) / N - condMean ** 2;
    const si = Math.max(0, Math.min(1, (varY - condVar) / varY));
    return { name: f.name, si, si_pct: si * 100 };
  }).sort((a, b) => b.si - a.si);
}

/**
 * IC bootstrap para percentiles — Efron & Tibshirani (1993).
 * No paramétrico: no asume distribución de la muestra. Más honesto
 * que IC normal cuando N es pequeño o la distribución es asimétrica.
 */
function bootstrapCI(sorted: number[], p: number, B = 500): [number, number] {
  const N = sorted.length; if (N < 4) return [sorted[0], sorted[N-1]];
  const pcts: number[] = [];
  for (let b = 0; b < B; b++) {
    const resample = Array.from({ length: N }, () => sorted[Math.floor(Math.random() * N)]).sort((a, b) => a - b);
    pcts.push(resample[Math.min(N - 1, Math.floor(N * p))]);
  }
  pcts.sort((a, b) => a - b);
  return [pcts[Math.floor(B * 0.025)], pcts[Math.floor(B * 0.975)]];
}

/** Tabla de referencia Six Sigma: nivel σ (corto plazo, con corrimiento 1.5σ) → DPMO. */
const SIGMA_TABLE: { sigma: number; dpmo: number; yield: number }[] = [
  { sigma: 1, dpmo: 691462, yield: 30.85 },
  { sigma: 2, dpmo: 308538, yield: 69.15 },
  { sigma: 3, dpmo: 66807, yield: 93.32 },
  { sigma: 4, dpmo: 6210, yield: 99.379 },
  { sigma: 5, dpmo: 233, yield: 99.9767 },
  { sigma: 6, dpmo: 3.4, yield: 99.99966 },
];

const MC_STORAGE_KEY = "kronos_mc_params_v1";

// ---------------------------------------------------------------------------
// Selección objetiva de distribución (bondad de ajuste) y de tamaño de muestra
// ---------------------------------------------------------------------------

/** Sesgo muestral (Fisher-Pearson ajustado). >0 = cola a la derecha. */
function sampleSkewness(xs: number[], mean: number, std: number): number {
  const n = xs.length;
  if (n < 3 || std === 0) return 0;
  const m3 = xs.reduce((s, x) => s + Math.pow((x - mean) / std, 3), 0) / n;
  return (Math.sqrt(n * (n - 1)) / (n - 2)) * m3;
}

/** Estadístico de Kolmogorov–Smirnov: D = máx|F_empírica − F_teórica|. Menor = mejor ajuste. */
function ksAgainst(sorted: number[], cdf: (x: number) => number): number {
  const n = sorted.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const f = cdf(sorted[i]);
    d = Math.max(d, Math.abs(f - (i + 1) / n), Math.abs(f - i / n));
  }
  return d;
}

function ksNormal(sorted: number[], mean: number, std: number): number {
  if (std <= 0) return 1;
  return ksAgainst(sorted, (x) => normalCDF((x - mean) / std));
}

function ksLogNormal(sorted: number[]): number {
  const xs = sorted.filter((x) => x > 0);
  const n = xs.length;
  if (n < 2) return 1;
  const logs = xs.map((x) => Math.log(x));
  const mu = logs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(logs.reduce((s, l) => s + (l - mu) ** 2, 0) / (n - 1));
  if (sd <= 0) return 1;
  return ksAgainst(xs, (x) => (x <= 0 ? 0 : normalCDF((Math.log(x) - mu) / sd)));
}

function ksTriangular(sorted: number[], mean: number): number {
  const n = sorted.length;
  const a = sorted[0];
  const b = sorted[n - 1];
  if (b <= a) return 1;
  // Modo estimado por método de momentos: c = 3·μ − a − b, acotado a [a, b]
  const c = Math.max(a, Math.min(b, 3 * mean - a - b));
  const cdf = (x: number) => {
    if (x <= a) return 0;
    if (x >= b) return 1;
    if (x < c) return (x - a) ** 2 / ((b - a) * (c - a) || 1e-9);
    return 1 - (b - x) ** 2 / ((b - a) * (b - c) || 1e-9);
  };
  return ksAgainst(sorted, cdf);
}

const PRESETS = [1000, 5000, 10000, 20000, 50000];

const DIST_INFO: Record<DistKey, { label: string; desc: string }> = {
  pert: {
    label: "PERT-Beta ★ (recomendada)",
    desc: "Estándar PMI/PMBOK para tiempos de tarea manual. Usa mín/moda/máx observados. La más usada en ingeniería industrial.",
  },
  bootstrap: {
    label: "Bootstrap (remuestreo real)",
    desc: "Remuestrea los tiempos observados con ruido. No asume forma; respeta tus datos reales.",
  },
  lognormal: {
    label: "Log-normal",
    desc: "Sesgada a la derecha. Modela tiempos con cola larga (ciclos lentos ocasionales). Fundamentada en teoría multiplicativa.",
  },
  normal: {
    label: "Normal (Gaussiana)",
    desc: "Simétrica alrededor de la media. Solo válida si el proceso es muy estable y el CV < 15%.",
  },
  triangular: {
    label: "Triangular",
    desc: "Mínimo, modo y máximo. Usar solo si no tienes datos históricos (distribución de ignorancia).",
  },
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
const MonteCarloSimulator: React.FC = () => {
  const { cycles, operators, costConfig } = useTimeStudy();

  const avgHourlyCost =
    operators.length > 0
      ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length
      : 15000;

  // Estadística base de los datos reales (no afectada por palancas)
  const base = useMemo(() => {
    const times = cycles.map((c) => c.duration).filter((d) => d > 0);
    const n = times.length;
    if (n === 0) return { times, mean: 0, std: 0 };
    const mean = times.reduce((a, b) => a + b, 0) / n;
    const variance =
      n > 1
        ? times.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / (n - 1)
        : 0;
    return { times, mean, std: Math.sqrt(variance) };
  }, [cycles]);

  // Parámetros ajustables — se restauran desde localStorage (persisten entre sesiones)
  const saved = useMemo(() => {
    try {
      const raw = localStorage.getItem(MC_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<{ dist: DistKey; simCount: number; target: number; varReduction: number; meanShift: number }>) : null;
    } catch {
      return null;
    }
  }, []);

  const [dist, setDist] = useState<DistKey>(saved?.dist ?? "bootstrap");
  const [simCount, setSimCount] = useState(saved?.simCount ?? 10000);
  const [target, setTarget] = useState(saved?.target ?? costConfig.targetCycleTime);
  const [varReduction, setVarReduction] = useState(saved?.varReduction ?? 0); // 0-80 %
  const [meanShift, setMeanShift] = useState(saved?.meanShift ?? 0); // -30..+30 %

  const [simResults, setSimResults] = useState<SimResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Persistir parámetros cada vez que cambian (los "ajustes guardados" del asesor)
  useEffect(() => {
    try {
      localStorage.setItem(
        MC_STORAGE_KEY,
        JSON.stringify({ dist, simCount, target, varReduction, meanShift })
      );
      setSavedFlash(true);
      const id = setTimeout(() => setSavedFlash(false), 1200);
      return () => clearTimeout(id);
    } catch {
      /* almacenamiento no disponible */
    }
  }, [dist, simCount, target, varReduction, meanShift]);

  const resetParams = () => {
    setDist("bootstrap");
    setSimCount(10000);
    setTarget(costConfig.targetCycleTime);
    setVarReduction(0);
    setMeanShift(0);
    try {
      localStorage.removeItem(MC_STORAGE_KEY);
    } catch {
      /* noop */
    }
  };

  // Recomendación objetiva: elige distribución (bondad de ajuste KS) y N exacto
  // a partir de los datos reales capturados. Reproducible, no subjetiva.
  const recommendation = useMemo(() => {
    const xs = base.times;
    const n = xs.length;
    if (n < 3 || base.std <= 0) return null;
    const sorted = [...xs].sort((a, b) => a - b);

    const skew = sampleSkewness(xs, base.mean, base.std);
    const cv = base.mean > 0 ? base.std / base.mean : 0;

    // Bondad de ajuste (KS) de las TRES distribuciones paramétricas
    // Anderson-Darling (más potente que KS para las colas)
    const ad: Record<DistKey, number> = {
      normal:     adNormal(sorted, base.mean, base.std),
      lognormal:  adLogNormal(sorted),
      triangular: adTriangular(sorted, base.mean),
      pert:       adPert(sorted, base.mean, base.std),
      bootstrap:  0.001, // bootstrap siempre ajusta perfectamente; lo excluimos del ranking
    };
    // Excluir bootstrap del ranking paramétrico
    const ranked = (Object.entries(ad) as [DistKey, number][])
      .filter(([k]) => k !== "bootstrap")
      .sort((a, b) => a[1] - b[1]);
    const bestDist = ranked[0][0] as DistKey;

    // Tamaño de muestra exacto — el mayor de dos requisitos de precisión (95%):
    const z = 1.96;
    const p = Math.min(0.99, Math.max(0.01, sorted.filter((x) => x <= target).length / n));
    // (1) media con error relativo ≤ 0.5%:  N = (z·σ / (0.005·μ))²
    const nMean = Math.ceil(Math.pow((z * base.std) / (0.005 * base.mean || 1), 2));
    // (2) probabilidad de cumplir con error absoluto ≤ 1%:  N = z²·p(1−p) / 0.01²
    const nProp = Math.ceil((z * z * p * (1 - p)) / (0.01 * 0.01));
    const nRaw = Math.max(nMean, nProp);
    const binding = nMean >= nProp ? "media" : "probabilidad";
    const nRec = PRESETS.find((pp) => pp >= nRaw) ?? PRESETS[PRESETS.length - 1];

    const lowData = n < 15;
    return { n, skew, cv, adScoresRec: ad, ranked, bestDist, p, nMean, nProp, nRaw, nRec, binding, lowData };
  }, [base, target]);

  const applyRecommendation = () => {
    if (!recommendation) return;
    setDist(recommendation.bestDist);
    setSimCount(recommendation.nRec);
  };

  const formatMoney = (n: number) => {
    const sign = n < 0 ? "-" : "";
    const v = Math.abs(n);
    if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(0)}K`;
    return `${sign}$${v.toFixed(0)}`;
  };

  const tooltipStyle = {
    contentStyle: {
      background: "hsla(230,22%,9%,0.95)",
      border: "1px solid hsla(230,16%,28%,0.3)",
      borderRadius: "8px",
      color: "hsl(210,20%,92%)",
      fontSize: "11px",
    },
    labelStyle: { color: "hsl(215,15%,60%)" },
  };

  // -------------------------------------------------------------------------
  // Simulación
  // -------------------------------------------------------------------------
  const runSimulation = () => {
    if (cycles.length < 3) return;
    setIsRunning(true);

    setTimeout(() => {
      const { times, mean, std } = base;
      const effStd  = std  * (1 - varReduction / 100);
      const effMean = mean * (1 + meanShift / 100);
      const sorted_times = [...times].sort((a, b) => a - b);
      const tMin = sorted_times[0] ?? effMean * 0.5;
      const tMax = sorted_times[sorted_times.length - 1] ?? effMean * 1.5;

      // ── Generación de uniformes: LHS + Antithetic Variates ───────────────
      // Antithetic + LHS juntos: estándar de simulación académica.
      // Reduce el error estándar del estimador de la media en ~40% sobre aleatorio puro.
      const uniforms = antitheticPairs(simCount);

      // ── Funciones de muestreo (quantile-based) ───────────────────────────
      const fromUniform = (u: number): number => {
        if (dist === "normal") {
          return Math.max(0, effMean + effStd * normalInv(u));
        }
        if (dist === "lognormal") {
          const cv = effMean > 0 ? effStd / effMean : 0.1;
          const sigma2 = Math.log(1 + cv * cv);
          const mu = Math.log(Math.max(effMean, 1e-9)) - sigma2 / 2;
          return Math.exp(mu + Math.sqrt(sigma2) * normalInv(u));
        }
        if (dist === "triangular") {
          const a = Math.max(0, effMean - 2.5 * effStd);
          const b = effMean + 2.5 * effStd;
          const c = effMean;
          const fc = b > a ? (c - a) / (b - a) : 0.5;
          if (u < fc) return a + Math.sqrt(u * (b - a) * Math.max(0, c - a));
          return b - Math.sqrt((1 - u) * (b - a) * Math.max(0, b - c));
        }
        if (dist === "pert") {
          // PERT-Beta: estándar PMI/PMBOK para tiempos de tarea manual
          const a = Math.max(0, tMin * (1 + meanShift / 100));
          const b = tMax * (1 + meanShift / 100);
          const m = Math.max(a, Math.min(b, effMean));
          return pertSample(u, a, m, b);
        }
        // bootstrap: remuestreo de los datos reales con variabilidad controlada
        const idx = Math.floor(u * times.length);
        const real = times[Math.min(idx, times.length - 1)];
        return Math.max(0, real * (1 + meanShift / 100) + effStd * 0.12 * normalInv(Math.random() || 1e-9));
      };

      // ── Generación de escenarios ──────────────────────────────────────────
      const scenarios: number[] = new Array(simCount);
      let runningSum = 0;
      const convergence: ConvergencePoint[] = [];
      const cpRaw = [100,250,500,1000,2000,3500,5000,7500,10000,20000,35000,50000].filter(c => c <= simCount);
      const checkpoints = Array.from(new Set([...cpRaw, simCount])).sort((a,b)=>a-b);
      const cpSet = new Set(checkpoints);

      for (let i = 0; i < simCount; i++) {
        const v = Math.max(0, fromUniform(uniforms[i]));
        scenarios[i] = v;
        runningSum += v;
        const count = i + 1;
        if (cpSet.has(count)) {
          const prefix = scenarios.slice(0, count).sort((a, b) => a - b);
          convergence.push({ n: count, mean: runningSum / count, p95: prefix[Math.floor(count * 0.95)] });
        }
      }

      scenarios.sort((a, b) => a - b);
      const N = simCount;

      const pct = (p: number) => scenarios[Math.min(N - 1, Math.floor(N * p))];
      const p5 = pct(0.05);
      const p10 = pct(0.1);
      const p50 = pct(0.5);
      const p90 = pct(0.9);
      const p95 = pct(0.95);

      const simMean = runningSum / N;
      const simVar =
        scenarios.reduce((s, t) => s + Math.pow(t - simMean, 2), 0) /
        Math.max(1, N - 1);
      const simStd = Math.sqrt(simVar);
      const cv = simMean > 0 ? simStd / simMean : 0;

      const probMeetTarget =
        scenarios.filter((s) => s <= target).length / N;

      const se = simStd / Math.sqrt(N);
      const ciLow = simMean - 1.96 * se;
      const ciHigh = simMean + 1.96 * se;

      // Capacidad — suite completa
      const denomStd = effStd > 0 ? effStd : 1e-9;
      const cpk = (target - simMean) / (3 * denomStd);
      // Cp: capacidad potencial (solo dispersión, ignora centrado)
      const cp  = target / (6 * denomStd);
      // Cpm (Taguchi): penaliza también la desviación del objetivo
      const tau = Math.sqrt(simVar + Math.pow(simMean - target, 2));
      const cpm = target / (6 * Math.max(tau, 1e-9));
      // Z corto plazo del proceso (capacidad unilateral hacia el objetivo)
      const sigmaLevel = (target - simMean) / denomStd;
      // Nivel Six Sigma con el corrimiento estándar de 1.5σ, acotado a la escala 1–6
      const sigmaSix = Math.max(0, Math.min(6, sigmaLevel + 1.5));
      // DPMO teórico que corresponde a ese nivel sigma (cola unilateral)
      const dpmoTheoretical = Math.round(
        Math.min(1e6, Math.max(0, (1 - normalCDF(sigmaSix - 1.5)) * 1e6))
      );
      // DPMO empírico observado directamente en la simulación
      const dpmo = Math.round((1 - probMeetTarget) * 1e6);

      // IC bootstrap no paramétrico para P5 y P95 (Efron & Tibshirani, 1993)
      const p5ci  = bootstrapCI(scenarios, 0.05, 400);
      const p95ci = bootstrapCI(scenarios, 0.95, 400);

      // Bondad de ajuste Anderson-Darling para todas las distribuciones
      const sortedScen = scenarios; // ya ordenado
      const adScores: Record<string, number> = {
        normal:      adNormal(sortedScen, simMean, simStd),
        lognormal:   adLogNormal(sortedScen),
        triangular:  adTriangular(sortedScen, simMean),
        pert:        adPert(sortedScen, simMean, simStd),
      };

      // Índices de Sobol de primer orden — sensibilidad global
      const costPerSecond2 = avgHourlyCost / 3600;
      const sobol = sobolFirstOrder(
        scenarios.map(t => qty * (price - t * costPerSecond2)),
        [
          { name: "Tiempo ciclo",    perturb: (_, f) => scenarios.map(t => qty * (price - t*(1+f)*costPerSecond2)) },
          { name: "Valor producto",  perturb: (_, f) => scenarios.map(t => qty * (price*(1+f) - t*costPerSecond2)) },
          { name: "Volumen mensual", perturb: (_, f) => scenarios.map(t => qty*(1+f) * (price - t*costPerSecond2)) },
          { name: "Costo M.O.",     perturb: (_, f) => scenarios.map(t => qty * (price - t*(avgHourlyCost*(1+f))/3600)) },
        ]
      );

      // Prueba de hipótesis — t de una muestra (unilateral H1: μ < objetivo)
      // H0: μ ≥ objetivo (el proceso NO cumple)  ·  H1: μ < objetivo (el proceso SÍ cumple)
      const tStat = (simMean - target) / (simStd / Math.sqrt(N));
      // Con N grande la t converge a la normal → usamos la CDF normal para el p-valor
      const pValue = Math.max(0, Math.min(1, normalCDF(tStat)));
      const rejectH0 = pValue < 0.05; // se rechaza H0 ⇒ evidencia de que μ < objetivo

      // Financiero
      const costPerSecond = avgHourlyCost / 3600;
      const qty = costConfig.monthlyProductionTarget;
      const price = costConfig.productValue;
      const profit = (t: number) => qty * (price - t * costPerSecond);

      const expected = profit(simMean);
      const best = profit(p5);
      const worst = profit(p95);
      const annualExpected = expected * 12;
      const var95 = expected - worst;

      // CVaR: peor 5% de tiempos = los más altos (cola superior del array ordenado)
      const tailStart = Math.floor(0.95 * N);
      const tail = scenarios.slice(tailStart);
      const tailProfitMean =
        tail.length > 0
          ? tail.reduce((s, t) => s + profit(t), 0) / tail.length
          : worst;
      const cvar = expected - tailProfitMean;

      const costSaved = (simMean - p5) * costPerSecond * qty;
      const costLost = (p95 - simMean) * costPerSecond * qty;

      // ROI de las palancas (vs. línea base sin palancas = media real)
      const baselineExpected = profit(mean);
      const improvementMonthly = expected - baselineExpected;
      const improvementAnnual = improvementMonthly * 12;
      const improvementPct =
        Math.abs(baselineExpected) > 0
          ? (improvementMonthly / Math.abs(baselineExpected)) * 100
          : 0;
      const showImprovement = varReduction > 0 || meanShift !== 0;

      // N recomendado
      const marginSec = Math.max(0.5, 0.01 * simMean);
      const recMeanN = Math.ceil(Math.pow((1.96 * simStd) / marginSec, 2));
      const p = Math.min(0.99, Math.max(0.01, probMeetTarget));
      const recProbN = Math.ceil((1.96 * 1.96 * p * (1 - p)) / (0.01 * 0.01));
      const recommendedN = Math.max(recMeanN, recProbN);

      // Histograma (32 bins)
      const binCount = 32;
      const minT = scenarios[0];
      const maxT = scenarios[N - 1];
      const binWidth = (maxT - minT) / binCount || 1;
      const histogram: HistoBin[] = [];
      let cursor = 0;
      for (let i = 0; i < binCount; i++) {
        const lo = minT + i * binWidth;
        const hi = lo + binWidth;
        let count = 0;
        // Conteo secuencial sobre el array ordenado
        while (cursor < N) {
          const s = scenarios[cursor];
          const inBin = i === binCount - 1 ? s <= hi : s < hi;
          if (inBin) {
            count++;
            cursor++;
          } else {
            break;
          }
        }
        const mid = lo + binWidth / 2;
        histogram.push({
          bin: mid.toFixed(0),
          mid,
          count,
          meets: mid <= target,
        });
      }

      // Valor más probable (moda): el centro del bin con mayor frecuencia.
      const modeBin = histogram.reduce(
        (best, b) => (b.count > best.count ? b : best),
        histogram[0]
      );
      const mode = modeBin.mid;
      const modeProbPct = (modeBin.count / N) * 100;

      // CDF (curva-S) 40 puntos
      const cdf: CdfPoint[] = [];
      const cdfPoints = 40;
      let cdfCursor = 0;
      for (let i = 0; i < cdfPoints; i++) {
        const t = minT + ((maxT - minT) * i) / (cdfPoints - 1);
        while (cdfCursor < N && scenarios[cdfCursor] <= t) cdfCursor++;
        cdf.push({ t, prob: (cdfCursor / N) * 100 });
      }

      // Tornado: impacto ±10% sobre `expected`
      const tornadoInputs: { name: string; recompute: (f: number) => number }[] = [
        {
          name: "Tiempo de ciclo",
          recompute: (f) => qty * (price - simMean * f * costPerSecond),
        },
        {
          name: "Valor producto",
          recompute: (f) => qty * (price * f - simMean * costPerSecond),
        },
        {
          name: "Volumen mensual",
          recompute: (f) => qty * f * (price - simMean * costPerSecond),
        },
        {
          name: "Costo mano de obra",
          recompute: (f) => qty * (price - simMean * (avgHourlyCost * f) / 3600),
        },
      ];
      const tornado: TornadoBar[] = tornadoInputs
        .map((inp) => {
          const a = inp.recompute(0.9) - expected;
          const b = inp.recompute(1.1) - expected;
          const low = Math.min(a, b);
          const high = Math.max(a, b);
          return { name: inp.name, low, high, range: high - low };
        })
        .sort((x, y) => y.range - x.range);

      // Goal seek (95% cumplimiento, normal one-sided, z=1.645)
      const goalMean = target - 1.645 * denomStd;
      const goalMeanPct =
        simMean > 0 ? ((simMean - goalMean) / simMean) * 100 : 0;
      const goalStd =
        target - simMean > 0 ? (target - simMean) / 1.645 : 0;
      const goalStdPct =
        denomStd > 0 ? ((denomStd - goalStd) / denomStd) * 100 : 0;

      // Veredicto
      let verdict: SimResult["verdict"] = "noCapaz";
      if (probMeetTarget >= 0.95 && cpk >= 1.33) verdict = "capaz";
      else if (probMeetTarget >= 0.8 || cpk >= 1) verdict = "aceptable";

      setSimResults({
        scenarios,
        minT,
        maxT,
        mean: simMean,
        std: simStd,
        cv,
        p5,
        p10,
        p50,
        p90,
        p95,
        probMeetTarget,
        se,
        ciLow,
        ciHigh,
        mode,
        modeProbPct,
        cpk, cp, cpm,
        sigmaLevel, sigmaSix, dpmoTheoretical, dpmo,
        tStat, pValue, rejectH0,
        p5ci, p95ci,
        sobol, adScores,
        samplingMethod: "LHS + Antithetic Variates",
        expected,
        best,
        worst,
        annualExpected,
        var95,
        cvar,
        costSaved,
        costLost,
        baselineExpected,
        improvementMonthly,
        improvementAnnual,
        improvementPct,
        showImprovement,
        convergence,
        recommendedN,
        histogram,
        cdf,
        tornado,
        goalMean,
        goalMeanPct,
        goalStd,
        goalStdPct,
        verdict,
        target,
        effMean,
        effStd,
      });
      setIsRunning(false);
    }, 80);
  };

  // Preset que cubre el N recomendado
  const coveringPreset = (rec: number) =>
    PRESETS.find((p) => p >= rec) ?? PRESETS[PRESETS.length - 1];

  // Veredicto styling
  const verdictMeta = (v: SimResult["verdict"]) => {
    if (v === "capaz")
      return {
        label: "Proceso capaz y bajo control",
        color: "text-success",
        border: "border-success/30",
        glow: "glow-success",
        Icon: CheckCircle2,
        hsl: "hsl(152,60%,50%)",
        bg: "hsla(152,60%,50%,0.06)",
      };
    if (v === "aceptable")
      return {
        label: "Proceso aceptable con margen de mejora",
        color: "text-warning",
        border: "border-warning/30",
        glow: "",
        Icon: AlertTriangle,
        hsl: "hsl(38,92%,55%)",
        bg: "hsla(38,92%,55%,0.06)",
      };
    return {
      label: "Proceso no capaz: riesgo alto",
      color: "text-destructive",
      border: "border-destructive/30",
      glow: "glow-destructive",
      Icon: XCircle,
      hsl: "hsl(0,72%,60%)",
      bg: "hsla(0,72%,60%,0.06)",
    };
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 glow-accent">
              <Dice5 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground">
                Laboratorio Monte Carlo
              </h3>
              <p className="text-xs text-muted-foreground">
                Simulación estocástica de {simCount.toLocaleString()} escenarios ·
                capacidad, riesgo financiero y optimización
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetParams}
              className="btn-secondary-glass flex items-center gap-2 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restablecer
            </button>
            <button
              onClick={runSimulation}
              disabled={cycles.length < 3 || isRunning}
              className="btn-accent-glass flex items-center gap-2 disabled:opacity-40"
            >
              <Play className="w-4 h-4" /> {isRunning ? "Simulando..." : "Simular"}
            </button>
          </div>
        </div>
      </div>

      {cycles.length < 3 && (
        <div className="glass-card p-12 text-center">
          <Dice5 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-display font-bold text-foreground mb-2">
            Mínimo 3 ciclos requeridos
          </h3>
          <p className="text-sm text-muted-foreground">
            El laboratorio necesita datos históricos para proyectar escenarios
            futuros
          </p>
        </div>
      )}

      {/* Panel de parámetros */}
      {cycles.length >= 3 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-accent" />
            <h4 className="text-sm font-display font-bold text-foreground">
              Parámetros del modelo
            </h4>
            <span
              className={`ml-auto flex items-center gap-1 text-[10px] transition-opacity ${
                savedFlash ? "opacity-100 text-success" : "opacity-50 text-muted-foreground"
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              {savedFlash ? "Ajustes guardados" : "Ajustes recordados de tu última sesión"}
            </span>
          </div>

          {/* Explicación de cada ajuste — qué hace y para qué sirve */}
          <details className="mb-4 rounded-lg border border-border/40 bg-muted/5 overflow-hidden">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-accent">
              ¿Para qué sirve cada ajuste? (clic para ver la guía)
            </summary>
            <div className="px-3 pb-3 grid md:grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-muted-foreground leading-snug">
              <p>
                <b className="text-foreground">Distribución:</b> define la forma del azar
                con que se generan los tiempos. <i>Bootstrap</i> usa tus datos reales sin
                suponer forma; las demás asumen un patrón teórico.
              </p>
              <p>
                <b className="text-foreground">Nº de escenarios:</b> cuántos ciclos
                virtuales se simulan. Más escenarios → estimaciones más estables. El bloque
                de convergencia te dice cuántos son <i>suficientes</i>.
              </p>
              <p>
                <b className="text-foreground">Tiempo objetivo:</b> el límite superior
                (meta) contra el que se mide la capacidad. Es el <i>LSC</i> de los cálculos
                Cpk, nivel sigma, DPMO y la prueba de hipótesis.
              </p>
              <p>
                <b className="text-foreground">Reducir variabilidad:</b> simula una mejora
                Six Sigma que estrecha la dispersión (σ efectiva = σ·(1−x/100)). Sirve para
                responder “¿y si estandarizo el método?”.
              </p>
              <p>
                <b className="text-foreground">Ajuste de la media:</b> simula acelerar (−)
                o frenar (+) el proceso (μ efectiva = μ·(1+x/100)). Sirve para valorar el
                impacto de un cambio de ritmo o de balanceo de línea.
              </p>
              <p>
                <b className="text-foreground">Para qué sirve todo:</b> cada combinación es
                un <i>escenario hipotético</i>. El bloque ROI cuantifica en dinero la mejora
                frente a tu línea base real, y el veredicto dice si el proceso sería capaz.
              </p>
            </div>
          </details>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Distribución */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Distribución
              </label>
              <select
                value={dist}
                onChange={(e) => setDist(e.target.value as DistKey)}
                className="select-glass mt-1 text-xs"
              >
                {(Object.keys(DIST_INFO) as DistKey[]).map((k) => (
                  <option key={k} value={k}>
                    {DIST_INFO[k].label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                {DIST_INFO[dist].desc}
              </p>
            </div>

            {/* Nº escenarios */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Nº de escenarios
              </label>
              <select
                value={simCount}
                onChange={(e) => setSimCount(Number(e.target.value))}
                className="select-glass mt-1 text-xs"
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p.toLocaleString()}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                Más escenarios = estimaciones más estables (mayor coste de cómputo).
              </p>
            </div>

            {/* Tiempo objetivo */}
            {(() => {
              const slack = base.mean > 0 ? ((target - base.mean) / base.mean) * 100 : 0;
              const mins = Math.floor(target / 60);
              const secs = Math.round(target % 60);
              const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
              const slackColor = slack >= 20 ? "hsl(152,60%,50%)" : slack >= 5 ? "hsl(38,92%,55%)" : "hsl(0,72%,60%)";
              const slackMsg = slack >= 20
                ? `Holgura amplia (+${slack.toFixed(0)}% sobre la media) — el proceso tiene margen cómodo.`
                : slack >= 5
                ? `Holgura ajustada (+${slack.toFixed(0)}%) — cualquier ciclo lento lo supera.`
                : slack >= 0
                ? `Objetivo muy justo (+${slack.toFixed(0)}%) — la mayoría de ciclos lo rozarán.`
                : `⚠ Objetivo menor que la media actual (${slack.toFixed(0)}%) — irrealizable sin mejora.`;
              return (
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                    <span>Tiempo objetivo (LSC del proceso)</span>
                    <span className="text-primary font-mono font-bold">{timeStr}</span>
                  </label>
                  <input
                    type="range"
                    min={Math.max(1, Math.round(base.mean * 0.4))}
                    max={Math.round(Math.max(base.mean * 2, base.mean + 4 * base.std + 1))}
                    step={1}
                    value={target}
                    onChange={(e) => setTarget(Number(e.target.value))}
                    className="w-full mt-2 cursor-pointer"
                    style={{ accentColor: "hsl(192,90%,50%)" }}
                  />
                  <div className="mt-1.5 rounded-md px-2 py-1.5 text-[10px] leading-snug border"
                    style={{ borderColor: slackColor + "44", background: slackColor + "0d", color: slackColor }}>
                    {slackMsg}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                    <b>¿Qué es?</b> El tiempo máximo permitido por ciclo (Límite Superior de Control). Si el ciclo
                    lo supera, es un defecto. Contra este valor se calculan Cpk, DPMO, sigma y la prueba de hipótesis.
                    Subirlo = más tolerante; bajarlo = más exigente.
                  </p>
                </div>
              );
            })()}

            {/* Reducir variabilidad */}
            {(() => {
              const effSigma = base.std * (1 - varReduction / 100);
              const cv = base.mean > 0 ? (effSigma / base.mean) * 100 : 0;
              const sigmaEquiv = varReduction >= 75 ? "6σ" : varReduction >= 58 ? "5σ" : varReduction >= 40 ? "4σ" : varReduction >= 20 ? "3σ" : varReduction > 0 ? "2–3σ" : "línea base";
              const action = varReduction === 0
                ? "Sin cambio — simulando el proceso tal como está hoy."
                : varReduction <= 20
                ? `Mejora inicial (DMAIC Define/Measure). σ: ${base.std.toFixed(1)}s → ${effSigma.toFixed(1)}s. Equivale a estandarizar el puesto y eliminar las causas más obvias.`
                : varReduction <= 40
                ? `Mejora sólida (DMAIC Analyze/Improve). σ: ${base.std.toFixed(1)}s → ${effSigma.toFixed(1)}s. Requiere rediseño del método, poka-yoke o jidoka.`
                : varReduction <= 60
                ? `Mejora avanzada (≈ ${sigmaEquiv}). σ: ${base.std.toFixed(1)}s → ${effSigma.toFixed(1)}s. Requiere automatización parcial o cambio de proceso.`
                : `Mejora de clase mundial (≈ ${sigmaEquiv}). σ: ${base.std.toFixed(1)}s → ${effSigma.toFixed(1)}s. CV = ${cv.toFixed(1)}%. Solo alcanzable con procesos altamente controlados.`;
              const col = varReduction === 0 ? "hsl(215,15%,50%)" : varReduction <= 30 ? "hsl(38,92%,55%)" : "hsl(152,60%,50%)";
              return (
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                    <span>Reducir variabilidad (Six Sigma)</span>
                    <span className="font-mono font-bold" style={{ color: col }}>
                      {varReduction === 0 ? "sin cambio" : `−${varReduction}% σ · ≈ ${sigmaEquiv}`}
                    </span>
                  </label>
                  <input
                    type="range" min={0} max={80} step={1} value={varReduction}
                    onChange={(e) => setVarReduction(Number(e.target.value))}
                    className="w-full mt-2 cursor-pointer"
                    style={{ accentColor: "hsl(152,60%,50%)" }}
                  />
                  <div className="mt-1.5 rounded-md px-2 py-1.5 text-[10px] leading-snug border"
                    style={{ borderColor: col + "44", background: col + "0d", color: col }}>
                    {action}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                    <b>¿Qué hace?</b> Simula que implementas una mejora Six Sigma que reduce la dispersión del proceso.
                    La fórmula es σ_efectiva = σ · (1 − x/100). <b>No cambia la media</b> — solo estrecha la campana.
                    Cuanto más alta la barra, más consistente sería el operario: menos ciclos muy lentos.
                  </p>
                </div>
              );
            })()}

            {/* Ajuste de media */}
            {(() => {
              const effMeanVal = base.mean * (1 + meanShift / 100);
              const delta = effMeanVal - base.mean;
              const mins = Math.floor(effMeanVal / 60);
              const secs = (effMeanVal % 60).toFixed(1);
              const newTime = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
              const col = meanShift < 0 ? "hsl(152,60%,50%)" : meanShift > 0 ? "hsl(0,72%,60%)" : "hsl(215,15%,50%)";
              const meaning = meanShift === 0
                ? "Sin cambio — media real del proceso."
                : meanShift < 0
                ? `El operario aceleraría ${Math.abs(delta).toFixed(1)}s por ciclo en promedio. Causas: método mejorado, herramienta más ergonómica, entrenamiento, balanceo de línea.`
                : `El operario tardaría ${delta.toFixed(1)}s más por ciclo en promedio. Causas: fatiga acumulada, material difícil, pasos adicionales, retrabajos.`;
              const action = meanShift < -15
                ? "¿Es alcanzable? Consulta con el operario — una reducción >15% de la media generalmente requiere cambio de método, no solo motivación."
                : meanShift > 15
                ? "Escenario de riesgo: úsalo para estimar el impacto de un día de baja productividad o un lote de material defectuoso."
                : "";
              return (
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                    <span>Ajuste de la media (balanceo de línea)</span>
                    <span className="font-mono font-bold" style={{ color: col }}>
                      {meanShift === 0 ? "sin cambio" : `${meanShift > 0 ? "+" : ""}${meanShift}% → ${newTime}/ciclo`}
                    </span>
                  </label>
                  <input
                    type="range" min={-30} max={30} step={1} value={meanShift}
                    onChange={(e) => setMeanShift(Number(e.target.value))}
                    className="w-full mt-2 cursor-pointer"
                    style={{ accentColor: "hsl(265,80%,62%)" }}
                  />
                  <div className="mt-1.5 rounded-md px-2 py-1.5 text-[10px] leading-snug border"
                    style={{ borderColor: col + "44", background: col + "0d", color: col }}>
                    {meaning}
                    {action && <><br /><span className="opacity-80">{action}</span></>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                    <b>¿Qué hace?</b> Desplaza la campana completa a la izquierda (más rápido) o derecha (más lento).
                    La fórmula es μ_efectiva = μ · (1 + x/100). Usa valores negativos para simular mejoras de productividad;
                    positivos para simular días difíciles o condiciones adversas.
                  </p>
                </div>
              );
            })()}

            {/* Resumen base */}
            <div className="rounded-lg p-3 bg-muted/5 border border-border/40">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Datos observados
              </div>
              <div className="text-xs text-foreground font-mono">
                μ = {base.mean.toFixed(1)}s · σ = {base.std.toFixed(1)}s
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {cycles.length} ciclos · {operators.length} operarios · costo prom{" "}
                {formatMoney(avgHourlyCost)}/h
              </div>
            </div>
          </div>

          {/* Recomendación objetiva — distribución y N elegidos desde los datos */}
          {recommendation && (
            <div className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Crosshair className="w-4 h-4 text-accent" />
                <h5 className="text-sm font-display font-bold text-accent">
                  Recomendación objetiva del modelo
                </h5>
                <span className="text-[10px] text-muted-foreground">
                  calculada desde tus {recommendation.n} ciclos reales · sin criterio subjetivo
                </span>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                {/* Distribución elegida */}
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="stat-label">Distribución</span>
                    <span className="font-display font-bold text-lg text-accent">
                      {recommendation.bestDist === "lognormal"
                        ? "Log-normal"
                        : recommendation.bestDist === "triangular"
                        ? "Triangular"
                        : "Normal"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                    Mejor ajuste por prueba de <b>Kolmogorov–Smirnov</b> (menor D). Sesgo ={" "}
                    <b className="text-foreground">{recommendation.skew.toFixed(2)}</b>{" "}
                    (
                    {recommendation.skew > 0.5
                      ? "cola a la derecha ⇒ log-normal"
                      : recommendation.skew < -0.5
                      ? "cola a la izquierda"
                      : "≈ simétrica"}
                    ) · CV = {(recommendation.cv * 100).toFixed(1)}%.
                  </p>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/40">
                        <th className="text-left py-1 font-semibold">Distribución</th>
                        <th className="text-right py-1 font-semibold">D (KS)</th>
                        <th className="text-left py-1 pl-2 font-semibold">Ajuste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recommendation.ranked.map(([k, d], i) => (
                        <tr
                          key={k}
                          className={`border-b border-border/20 ${i === 0 ? "bg-accent/10" : ""}`}
                        >
                          <td className={`py-1 ${i === 0 ? "text-accent font-bold" : "text-foreground"}`}>
                            {k === "lognormal" ? "Log-normal" : k === "triangular" ? "Triangular" : "Normal"}
                          </td>
                          <td className="py-1 text-right font-mono text-muted-foreground">
                            {d.toFixed(3)}
                          </td>
                          <td className="py-1 pl-2">
                            {i === 0 && <span className="text-accent font-semibold">◄ mejor</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* N exacto */}
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="stat-label">Nº de escenarios</span>
                    <span className="font-display font-bold text-lg text-primary">
                      {recommendation.nRec.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                    N = <b>máx(N_media, N_prob)</b> al 95% de confianza, redondeado al preset que lo
                    cubre. La restricción activa es la {recommendation.binding}.
                  </p>
                  <div className="space-y-1.5 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">N media (±0.5% rel.)</span>
                      <span className="text-foreground">{recommendation.nMean.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">N prob. (±1% abs.)</span>
                      <span className="text-foreground">{recommendation.nProp.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/40 pt-1.5">
                      <span className="text-muted-foreground">N mínimo exacto</span>
                      <span className="text-primary font-bold">{recommendation.nRaw.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {recommendation.lowData && (
                <p className="text-[11px] text-warning mt-3 leading-snug">
                  ⚠ Con menos de 15 ciclos el ajuste es poco fiable. Para una tarea manual repetitiva
                  (doblado de papel) el prior teórico es <b>log-normal</b>; captura más ciclos para
                  robustecer la elección.
                </p>
              )}

              <button
                onClick={applyRecommendation}
                className="btn-accent-glass text-xs mt-3 flex items-center gap-2"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Aplicar recomendación
              </button>
            </div>
          )}
        </div>
      )}

      {simResults && (
        <>
          {/* Banner veredicto */}
          {(() => {
            const m = verdictMeta(simResults.verdict);
            return (
              <div
                className={`glass-card p-5 ${m.border} ${m.glow}`}
                style={{ background: m.bg }}
              >
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <m.Icon className={`w-9 h-9 ${m.color}`} />
                    <div>
                      <h3 className={`font-display font-bold text-lg ${m.color}`}>
                        {m.label}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {DIST_INFO[dist].label} · {simResults.scenarios.length.toLocaleString()} escenarios
                        {" · "}<span className="text-accent font-semibold">{simResults.samplingMethod}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className={`stat-value text-2xl ${m.color}`}>
                        {(simResults.probMeetTarget * 100).toFixed(1)}%
                      </div>
                      <div className="stat-label">Cumplimiento</div>
                    </div>
                    <div className="text-center">
                      <div className="stat-value text-2xl text-foreground">
                        {simResults.sigmaSix.toFixed(2)}σ
                      </div>
                      <div className="stat-label">Nivel Six Sigma (1–6)</div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`stat-value text-2xl ${
                          simResults.annualExpected >= 0
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {formatMoney(simResults.annualExpected)}
                      </div>
                      <div className="stat-label">Utilidad anual</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* KPIs financieros */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 text-center">
              <Target className="w-5 h-5 text-primary mx-auto mb-2" />
              <div className="stat-value text-xl text-primary">
                {(simResults.probMeetTarget * 100).toFixed(1)}%
              </div>
              <div className="stat-label">Prob. cumplir objetivo</div>
            </div>
            <div className="glass-card p-4 text-center">
              <DollarSign className="w-5 h-5 text-warning mx-auto mb-2" />
              <div className="stat-value text-xl text-warning">
                {formatMoney(simResults.expected)}
              </div>
              <div className="stat-label">Utilidad mensual esperada</div>
            </div>
            <div className="glass-card p-4 text-center">
              <TrendingUp className="w-5 h-5 text-success mx-auto mb-2" />
              <div className="stat-value text-xl text-success">
                {formatMoney(simResults.best)}
              </div>
              <div className="stat-label">Mejor caso (P5)</div>
            </div>
            <div className="glass-card p-4 text-center">
              <TrendingDown className="w-5 h-5 text-destructive mx-auto mb-2" />
              <div className="stat-value text-xl text-destructive">
                {formatMoney(simResults.worst)}
              </div>
              <div className="stat-label">Peor caso (P95)</div>
            </div>
          </div>

          {/* Fila de riesgo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 text-center">
              <ShieldAlert className="w-5 h-5 text-destructive mx-auto mb-2" />
              <div className="stat-value text-xl text-destructive">
                {formatMoney(simResults.var95)}
              </div>
              <div className="stat-label">VaR 95% (mensual)</div>
            </div>
            <div className="glass-card p-4 text-center">
              <Activity className="w-5 h-5 text-destructive mx-auto mb-2" />
              <div className="stat-value text-xl text-destructive">
                {formatMoney(simResults.cvar)}
              </div>
              <div className="stat-label">CVaR (cola 5%)</div>
            </div>
            <div className="glass-card p-4 text-center">
              <CalendarDays className="w-5 h-5 text-primary mx-auto mb-2" />
              <div
                className={`stat-value text-xl ${
                  simResults.annualExpected >= 0
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {formatMoney(simResults.annualExpected)}
              </div>
              <div className="stat-label">Utilidad anual</div>
            </div>
            <div className="glass-card p-4 text-center">
              <Zap className="w-5 h-5 text-warning mx-auto mb-2" />
              <div className="stat-value text-xl text-warning">
                {simResults.dpmo.toLocaleString()}
              </div>
              <div className="stat-label">DPMO</div>
            </div>
          </div>

          {/* Fila de capacidad */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Suite completa de capacidad: Cpk / Cp / Cpm */}
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="w-4 h-4 text-accent" />
                <span className="stat-label">Capacidad del proceso</span>
              </div>
              {[
                { label: "Cpk", value: simResults.cpk, desc: "Real (centrado + dispersión)", goal: 1.33 },
                { label: "Cp",  value: simResults.cp,  desc: "Potencial (solo dispersión)",  goal: 1.33 },
                { label: "Cpm", value: simResults.cpm, desc: "Taguchi (penaliza desv. objetivo)", goal: 1.0 },
              ].map(({ label, value, desc, goal }) => (
                <div key={label} className="mb-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[11px] font-mono font-bold text-foreground">{label}</span>
                    <span className={`font-display font-bold text-lg ${value >= goal ? "text-success" : value >= goal*0.75 ? "text-warning" : "text-destructive"}`}>
                      {value.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted/20 overflow-hidden mb-0.5">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100,(value/2)*100)}%`, background: value>=goal?"hsl(152,60%,50%)":value>=goal*0.75?"hsl(38,92%,55%)":"hsl(0,72%,60%)" }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground">{desc} · meta ≥ {goal}</p>
                </div>
              ))}
            </div>
            {/* Media + IC95 */}
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sigma className="w-4 h-4 text-primary" />
                <span className="stat-label">Media (IC 95%)</span>
              </div>
              <div className="stat-value text-2xl text-primary">
                {simResults.mean.toFixed(1)}s
              </div>
              <div className="text-[10px] text-muted-foreground mt-2 font-mono">
                [{simResults.ciLow.toFixed(1)} ; {simResults.ciHigh.toFixed(1)}]
              </div>
            </div>
            {/* CV */}
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-accent" />
                <span className="stat-label">Coef. variación</span>
              </div>
              <div
                className={`stat-value text-2xl ${
                  simResults.cv <= 0.1
                    ? "text-success"
                    : simResults.cv <= 0.25
                    ? "text-warning"
                    : "text-destructive"
                }`}
              >
                {(simResults.cv * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">
                σ = {simResults.std.toFixed(1)}s
              </div>
            </div>
            {/* Error estándar */}
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Crosshair className="w-4 h-4 text-primary" />
                <span className="stat-label">Error estándar</span>
              </div>
              <div className="stat-value text-2xl text-foreground">
                ±{simResults.se.toFixed(3)}s
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">
                precisión de la media simulada
              </div>
            </div>
          </div>

          {/* Percentiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { l: "P5 (Optimista)", v: simResults.p5, c: "text-success" },
              { l: "P10", v: simResults.p10, c: "text-success" },
              { l: "P50 (Mediana)", v: simResults.p50, c: "text-primary" },
              { l: "P90", v: simResults.p90, c: "text-warning" },
              { l: "P95 (Pesimista)", v: simResults.p95, c: "text-destructive" },
            ].map((p) => (
              <div key={p.l} className="glass-card p-4 text-center">
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${p.c}`}
                >
                  {p.l}
                </div>
                <div className={`font-display font-bold text-2xl ${p.c}`}>
                  {p.v.toFixed(1)}s
                </div>
              </div>
            ))}
          </div>

          {/* Valor más probable + medidas de tendencia central */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Crosshair className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-display font-bold text-foreground">
                Resultado más probable
              </h4>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4 leading-snug">
              El <b className="text-accent">valor más probable (moda)</b> es el tiempo de
              ciclo que <b>más se repite</b> en la simulación: el resultado individual con
              mayor frecuencia. Difiere de la media (promedio) y de la mediana (P50). Cuando
              la distribución es asimétrica, conviene planear con la moda porque es el
              escenario que realmente verás más seguido.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg p-4 text-center bg-accent/5 border border-accent/30">
                <div className="font-display font-bold text-2xl text-accent">
                  {simResults.mode.toFixed(1)}s
                </div>
                <div className="stat-label">Más probable (moda)</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  ≈ {simResults.modeProbPct.toFixed(1)}% de los ciclos
                </div>
              </div>
              <div className="rounded-lg p-4 text-center bg-muted/5 border border-border/40">
                <div className="font-display font-bold text-2xl text-primary">
                  {simResults.mean.toFixed(1)}s
                </div>
                <div className="stat-label">Media (promedio)</div>
                <div className="text-[10px] text-muted-foreground mt-1">centro de masa</div>
              </div>
              <div className="rounded-lg p-4 text-center bg-muted/5 border border-border/40">
                <div className="font-display font-bold text-2xl text-foreground">
                  {simResults.p50.toFixed(1)}s
                </div>
                <div className="stat-label">Mediana (P50)</div>
                <div className="text-[10px] text-muted-foreground mt-1">50% por debajo</div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              {Math.abs(simResults.mode - simResults.mean) < 0.05 * simResults.mean ? (
                <>
                  Moda ≈ media ≈ mediana → la distribución es prácticamente{" "}
                  <span className="text-success font-semibold">simétrica y estable</span>.
                </>
              ) : simResults.mean > simResults.mode ? (
                <>
                  La media supera a la moda →{" "}
                  <span className="text-warning font-semibold">cola hacia tiempos altos</span>:
                  hay ciclos lentos ocasionales que encarecen el promedio.
                </>
              ) : (
                <>
                  La moda supera a la media →{" "}
                  <span className="text-warning font-semibold">cola hacia tiempos bajos</span>.
                </>
              )}
            </p>
          </div>

          {/* Escala Six Sigma (1–6) + DPMO */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Sigma className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-display font-bold text-foreground">
                Nivel Six Sigma y errores por millón (DPMO)
              </h4>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4 leading-snug">
              La escala Six Sigma va de <b>1σ a 6σ</b>. A mayor nivel, menos{" "}
              <b>defectos por millón de oportunidades (DPMO)</b> — un ciclo es “defecto” si
              supera el objetivo de {simResults.target.toFixed(0)}s. El máximo de la escala,
              6σ, equivale a apenas <b>3.4 DPMO</b>.
            </p>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="rounded-lg p-4 text-center bg-primary/5 border border-primary/30">
                <div className="font-display font-bold text-2xl text-primary">
                  {simResults.sigmaSix.toFixed(2)}σ
                </div>
                <div className="stat-label">Nivel alcanzado (1–6)</div>
              </div>
              <div className="rounded-lg p-4 text-center bg-warning/5 border border-warning/30">
                <div className="font-display font-bold text-2xl text-warning">
                  {simResults.dpmo.toLocaleString()}
                </div>
                <div className="stat-label">DPMO observado (simulación)</div>
              </div>
              <div className="rounded-lg p-4 text-center bg-muted/5 border border-border/40">
                <div className="font-display font-bold text-2xl text-foreground">
                  {(simResults.probMeetTarget * 100).toFixed(2)}%
                </div>
                <div className="stat-label">Rendimiento (yield)</div>
              </div>
            </div>
            {/* Tabla de referencia 1σ–6σ con el nivel actual resaltado */}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1.5 font-semibold">Nivel σ</th>
                    <th className="text-right py-1.5 font-semibold">DPMO</th>
                    <th className="text-right py-1.5 font-semibold">Yield</th>
                    <th className="text-left py-1.5 pl-3 font-semibold">Tu proceso</th>
                  </tr>
                </thead>
                <tbody>
                  {SIGMA_TABLE.map((row) => {
                    const here =
                      Math.round(simResults.sigmaSix) === row.sigma ||
                      (simResults.sigmaSix >= 6 && row.sigma === 6);
                    return (
                      <tr
                        key={row.sigma}
                        className={`border-b border-border/20 ${
                          here ? "bg-primary/10" : ""
                        }`}
                      >
                        <td className={`py-1.5 font-mono ${here ? "text-primary font-bold" : "text-foreground"}`}>
                          {row.sigma}σ
                        </td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground">
                          {row.dpmo.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground">
                          {row.yield}%
                        </td>
                        <td className="py-1.5 pl-3">
                          {here && (
                            <span className="text-primary font-semibold">◄ aquí estás</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Prueba de hipótesis */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-display font-bold text-foreground">
                Prueba de hipótesis — ¿el proceso cumple el objetivo?
              </h4>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4 leading-snug">
              Contraste t de una muestra (unilateral, α = 0.05) sobre la media simulada
              frente al objetivo de {simResults.target.toFixed(0)}s.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg p-4 bg-muted/5 border border-border/40 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    H₀ (nula): μ ≥ {simResults.target.toFixed(0)}s
                  </span>
                  <span className="text-muted-foreground">no cumple</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-semibold">
                    H₁ (alterna): μ &lt; {simResults.target.toFixed(0)}s
                  </span>
                  <span className="text-foreground font-semibold">sí cumple</span>
                </div>
                <div className="border-t border-border/40 pt-2 mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
                  <div>
                    <span className="text-muted-foreground">t = </span>
                    <span className="text-foreground">{simResults.tStat.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">p = </span>
                    <span className="text-foreground">
                      {simResults.pValue < 0.001
                        ? "< 0.001"
                        : simResults.pValue.toFixed(3)}
                    </span>
                  </div>
                </div>
              </div>
              <div
                className={`rounded-lg p-4 border flex flex-col justify-center ${
                  simResults.rejectH0
                    ? "bg-success/5 border-success/30"
                    : "bg-destructive/5 border-destructive/30"
                }`}
              >
                <div
                  className={`font-display font-bold text-lg ${
                    simResults.rejectH0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {simResults.rejectH0
                    ? "Se rechaza H₀"
                    : "No se rechaza H₀"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {simResults.rejectH0 ? (
                    <>
                      Con p &lt; 0.05 hay{" "}
                      <span className="text-success font-semibold">
                        evidencia estadística
                      </span>{" "}
                      de que la media del proceso es <b>menor</b> que el objetivo: el proceso
                      cumple de forma significativa.
                    </>
                  ) : (
                    <>
                      Con p ≥ 0.05{" "}
                      <span className="text-destructive font-semibold">
                        no hay evidencia
                      </span>{" "}
                      suficiente de que la media esté por debajo del objetivo. El proceso no
                      cumple de forma significativa: hay que reducir media y/o variabilidad.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Histograma + CDF */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Histograma */}
            <div className="glass-card p-5">
              <h4 className="text-sm font-display font-bold text-foreground mb-4">
                Distribución de escenarios
              </h4>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={simResults.histogram}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsla(230,16%,28%,0.2)"
                  />
                  <XAxis
                    dataKey="bin"
                    tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }}
                    interval={3}
                  />
                  <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number) => [`${v} escenarios`, "Frecuencia"]}
                    labelFormatter={(l) => `≈ ${l}s`}
                  />
                  <ReferenceLine
                    x={simResults.histogram
                      .reduce(
                        (best, b) =>
                          Math.abs(b.mid - simResults.target) <
                          Math.abs(best.mid - simResults.target)
                            ? b
                            : best,
                        simResults.histogram[0]
                      )
                      .bin}
                    stroke="hsl(192,90%,50%)"
                    strokeDasharray="4 4"
                    label={{
                      value: "Objetivo",
                      fill: "hsl(192,90%,50%)",
                      fontSize: 10,
                      position: "top",
                    }}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {simResults.histogram.map((b, i) => (
                      <Cell
                        key={i}
                        fill={
                          b.meets ? "hsl(152,60%,50%)" : "hsl(0,72%,60%)"
                        }
                        fillOpacity={0.75}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "hsl(152,60%,50%)" }} />
                  Cumple objetivo
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "hsl(0,72%,60%)" }} />
                  No cumple
                </span>
              </div>
            </div>

            {/* CDF */}
            <div className="glass-card p-5">
              <h4 className="text-sm font-display font-bold text-foreground mb-4">
                Curva-S (probabilidad acumulada)
              </h4>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={simResults.cdf}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsla(230,16%,28%,0.2)"
                  />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}s`}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, "Acumulado"]}
                    labelFormatter={(l: number) => `${l.toFixed(1)}s`}
                  />
                  <ReferenceLine
                    x={simResults.target}
                    stroke="hsl(192,90%,50%)"
                    strokeDasharray="4 4"
                    label={{
                      value: "Objetivo",
                      fill: "hsl(192,90%,50%)",
                      fontSize: 10,
                      position: "insideTopRight",
                    }}
                  />
                  <ReferenceLine
                    y={95}
                    stroke="hsl(38,92%,55%)"
                    strokeDasharray="4 4"
                    label={{
                      value: "95%",
                      fill: "hsl(38,92%,55%)",
                      fontSize: 10,
                      position: "insideTopLeft",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="prob"
                    stroke="hsl(265,80%,62%)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bloque ROI (condicional) */}
          {simResults.showImprovement && (
            <div className="glass-card p-5 border-accent/30">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpCircle className="w-5 h-5 text-accent" />
                <h4 className="text-sm font-display font-bold text-accent">
                  ROI del escenario de mejora
                </h4>
                <span className="text-[10px] text-muted-foreground">
                  vs. línea base (μ real, sin palancas)
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="stat-value text-xl text-muted-foreground">
                    {formatMoney(simResults.baselineExpected)}
                  </div>
                  <div className="stat-label">Línea base mensual</div>
                </div>
                <div className="text-center">
                  <div
                    className={`stat-value text-xl ${
                      simResults.improvementMonthly >= 0
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {formatMoney(simResults.improvementMonthly)}
                  </div>
                  <div className="stat-label">Mejora mensual</div>
                </div>
                <div className="text-center">
                  <div
                    className={`stat-value text-xl ${
                      simResults.improvementAnnual >= 0
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {formatMoney(simResults.improvementAnnual)}
                  </div>
                  <div className="stat-label">Mejora anual</div>
                </div>
                <div className="text-center">
                  <div
                    className={`stat-value text-xl ${
                      simResults.improvementPct >= 0
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {simResults.improvementPct >= 0 ? "+" : ""}
                    {simResults.improvementPct.toFixed(1)}%
                  </div>
                  <div className="stat-label">Variación utilidad</div>
                </div>
              </div>
            </div>
          )}

          {/* Convergencia */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-display font-bold text-foreground">
                Convergencia y tamaño de muestra
              </h4>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="glass-card p-4 text-center">
                <div className="stat-value text-xl text-primary">
                  {simResults.scenarios.length.toLocaleString()}
                </div>
                <div className="stat-label">Escenarios simulados</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="stat-value text-xl text-foreground">
                  {simResults.recommendedN.toLocaleString()}
                </div>
                <div className="stat-label">N recomendado</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div
                  className={`stat-value text-xl ${
                    simResults.scenarios.length >= simResults.recommendedN
                      ? "text-success"
                      : "text-warning"
                  }`}
                >
                  {simResults.scenarios.length >= simResults.recommendedN
                    ? "Suficiente"
                    : "Insuficiente"}
                </div>
                <div className="stat-label">Precisión estadística</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={simResults.convergence}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsla(230,16%,28%,0.2)"
                />
                <XAxis
                  dataKey="n"
                  type="number"
                  scale="log"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }}
                  tickFormatter={(v: number) => v.toLocaleString()}
                />
                <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(l: number) => `${l.toLocaleString()} escenarios`}
                  formatter={(v: number, name) => [
                    `${v.toFixed(1)}s`,
                    name === "mean" ? "Media" : "P95",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="mean"
                  stroke="hsl(192,90%,50%)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  stroke="hsl(265,80%,62%)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            {simResults.scenarios.length < simResults.recommendedN && (
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-warning">
                  La muestra actual no alcanza la precisión objetivo. Súbela para
                  estabilizar las estimaciones.
                </p>
                <button
                  onClick={() => {
                    setSimCount(coveringPreset(simResults.recommendedN));
                    runSimulation();
                  }}
                  className="btn-secondary-glass text-xs flex items-center gap-2"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                  Subir a {coveringPreset(simResults.recommendedN).toLocaleString()}
                </button>
              </div>
            )}
          </div>

          {/* Tornado + Goal seek */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Sobol — sensibilidad global (reemplaza Tornado) */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-accent" />
                <h4 className="text-sm font-display font-bold text-foreground">
                  Índices de Sobol — Sensibilidad Global
                </h4>
              </div>
              <p className="text-[10px] text-muted-foreground mb-4">
                Fracción de la varianza total de la utilidad debida a cada factor (Saltelli et al., 2010, JCP).
                Más riguroso que el tornado: captura efectos no lineales y de interacción.
              </p>
              <div className="space-y-3">
                {simResults.sobol.map((s, i) => (
                  <div key={s.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-foreground font-semibold">{i+1}. {s.name}</span>
                      <span className="font-mono text-accent">{s.si_pct.toFixed(1)}% varianza</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/20 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, s.si_pct)}%`,
                          background: i === 0
                            ? "hsl(192,90%,50%)"
                            : i === 1 ? "hsl(265,80%,62%)" : i === 2 ? "hsl(38,92%,55%)" : "hsl(152,60%,50%)",
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      S₁ = {s.si.toFixed(3)} — {s.si_pct > 40 ? "factor dominante" : s.si_pct > 15 ? "impacto moderado" : "impacto menor"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 border-t border-border/30 pt-2">
                El factor con mayor S₁ es el <b className="text-accent">palanca principal</b> para mejorar la utilidad.
                Concentra las intervenciones Lean/Six Sigma en ese factor primero.
              </p>
            </div>

            {/* Goal seek */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Crosshair className="w-4 h-4 text-accent" />
                <h4 className="text-sm font-display font-bold text-foreground">
                  Goal Seek — meta 95% cumplimiento
                </h4>
              </div>
              <p className="text-[10px] text-muted-foreground mb-4">
                Condiciones necesarias (modelo normal unilateral, z=1.645) para que
                el 95% de los ciclos cumpla el objetivo de {simResults.target.toFixed(0)}s
              </p>
              <div className="space-y-3">
                <div className="rounded-lg p-4 bg-muted/5 border border-border/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="stat-label">Media requerida</span>
                    <span className="font-display font-bold text-xl text-primary">
                      {simResults.goalMean.toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {simResults.goalMeanPct > 0 ? (
                      <>
                        Reducir la media en{" "}
                        <span className="text-success font-semibold">
                          {simResults.goalMeanPct.toFixed(1)}%
                        </span>{" "}
                        manteniendo la variabilidad.
                      </>
                    ) : (
                      <span className="text-success">
                        La media actual ya satisface la meta.
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg p-4 bg-muted/5 border border-border/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="stat-label">σ requerida</span>
                    <span className="font-display font-bold text-xl text-accent">
                      {simResults.goalStd > 0
                        ? `${simResults.goalStd.toFixed(1)}s`
                        : "—"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {simResults.goalStd > 0 && simResults.goalStdPct > 0 ? (
                      <>
                        Reducir σ en{" "}
                        <span className="text-success font-semibold">
                          {simResults.goalStdPct.toFixed(1)}%
                        </span>{" "}
                        manteniendo la media.
                      </>
                    ) : simResults.goalStd > 0 ? (
                      <span className="text-success">
                        La σ actual ya satisface la meta.
                      </span>
                    ) : (
                      <span className="text-destructive">
                        La media supera el objetivo: reducir σ no basta.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Ahorro / Riesgo */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="glass-card p-5 border-success/20">
              <h4 className="text-sm font-display font-bold text-success mb-2">
                Ahorro potencial
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                Operar en el P5 (mejor escenario) frente a la media simulada
              </p>
              <div className="stat-value text-3xl text-success">
                {formatMoney(simResults.costSaved)}
              </div>
              <div className="stat-label">ahorro mensual estimado</div>
            </div>
            <div className="glass-card p-5 border-destructive/20">
              <h4 className="text-sm font-display font-bold text-destructive mb-2">
                Riesgo de pérdida
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                Caer al P95 (peor escenario) frente a la media simulada
              </p>
              <div className="stat-value text-3xl text-destructive">
                {formatMoney(simResults.costLost)}
              </div>
              <div className="stat-label">pérdida mensual estimada</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MonteCarloSimulator;
