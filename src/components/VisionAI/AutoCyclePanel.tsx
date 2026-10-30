/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useMemo, useState } from 'react';
import { Crosshair, RotateCcw, Send, Repeat, GraduationCap, SkipForward, Flag, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTimeStudy, type CycleRecord } from '@/context/TimeStudyContext';
import type { CycleDetectorState, DetectedCycle } from '@/lib/cycleDetector';
import {
  buildTemplate, parseTemplate, recognizeSteps, templateMatchesSteps, TEMPLATE_KEY,
  type FeatureFrame, type MethodTemplate, type Recognition,
} from '@/lib/stepRecognition';

interface Props {
  status: CycleDetectorState;
  cycles: DetectedCycle[];
  isActive: boolean;
  onCalibrate: () => void;
  onClear: () => void;
  /** Trayectoria de las muñecas entre dos instantes (ms). */
  getFrames: (from: number, to: number) => FeatureFrame[];
}

const STATUS_LABEL: Record<CycleDetectorState, { text: string; color: string }> = {
  uncalibrated: { text: 'Sin posición inicial', color: 'text-muted-foreground' },
  home:         { text: 'Manos en posición inicial', color: 'text-emerald-400' },
  away:         { text: 'Ciclo en curso', color: 'text-primary' },
};

const CONF_CLS: Record<Recognition['confidence'], string> = {
  alta: 'text-emerald-400', media: 'text-warning', baja: 'text-destructive',
};

function loadTemplate(): MethodTemplate | null {
  try {
    return parseTemplate(localStorage.getItem(TEMPLATE_KEY));
  } catch {
    return null; // almacenamiento no disponible
  }
}

function saveTemplate(t: MethodTemplate | null) {
  try {
    if (t) localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t));
    else localStorage.removeItem(TEMPLATE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Cronómetro sin cronometrista: los ciclos se detectan solos y se envían al estudio de tiempos. */
const AutoCyclePanel: React.FC<Props> = ({ status, cycles, isActive, onCalibrate, onClear, getFrames }) => {
  const { operators, steps, cycles: studyCycles, addCycle } = useTimeStudy();
  const [operatorId, setOperatorId] = useState<number>(operators[0]?.id ?? 0);
  const [template, setTemplate] = useState<MethodTemplate | null>(loadTemplate);
  // Enseñanza en curso: inicio (ms) de cada paso marcado hasta ahora.
  const [teaching, setTeaching] = useState<number[] | null>(null);

  const usable = template && templateMatchesSteps(template, steps) ? template : null;

  // Los ciclos cerrados no cambian: se reconocen una vez por ciclo y plantilla.
  const recognized = useMemo(
    () => cycles.map(c => (usable ? recognizeSteps(getFrames(c.start, c.end), usable) : null)),
    [cycles, usable, getFrames],
  );

  const stats = useMemo(() => {
    if (!cycles.length) return null;
    const d = cycles.map(c => c.duration);
    const mean = d.reduce((s, x) => s + x, 0) / d.length;
    const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, d.length - 1));
    return { mean, cv: mean > 0 ? (sd / mean) * 100 : 0 };
  }, [cycles]);

  const stepName = (n: number) => steps.find(s => s.number === n)?.name ?? `Paso ${n}`;

  const startTeaching = () => setTeaching([Date.now()]);
  const nextTeachingStep = () => setTeaching(t => (t ? [...t, Date.now()] : t));
  const finishTeaching = () => {
    if (!teaching) return;
    const end = Date.now();
    const tpl = buildTemplate(getFrames(teaching[0], end), teaching, steps);
    setTeaching(null);
    if (!tpl) {
      toast.error('No se pudo aprender el método: se necesitan las manos a la vista durante todo el ciclo y una marca por paso.');
      return;
    }
    setTemplate(tpl);
    saveTemplate(tpl);
    toast.success(`Método aprendido: ${tpl.steps.length} pasos. Desde ahora cada ciclo trae sus tiempos por paso.`);
  };
  const forgetTemplate = () => {
    setTemplate(null);
    saveTemplate(null);
  };

  const handleSend = () => {
    const op = operators.find(o => o.id === operatorId);
    if (!op || !cycles.length) return;
    const already = studyCycles.filter(c => c.operatorId === op.id).length;
    let withSteps = 0;
    cycles.forEach((c, i) => {
      const r = recognized[i];
      const ok = r && r.confidence !== 'baja';
      if (ok) withSteps++;
      const record: CycleRecord = {
        id: crypto.randomUUID(),
        operatorId: op.id,
        operatorName: op.name,
        cycleNumber: already + i + 1,
        duration: Math.round(c.duration * 100) / 100,
        steps: ok
          ? r.steps.map(s => ({ stepNumber: s.stepNumber, stepName: stepName(s.stepNumber), duration: Math.round(s.duration * 100) / 100, timestamp: new Date(s.end) }))
          : [],
        timestamp: new Date(c.end),
        qualityPass: true,
        defects: [],
        notes: ok
          ? `Detectado por Vision AI (pasos reconocidos, confianza ${r.confidence})`
          : r ? 'Detectado por Vision AI (pasos no reconocidos: confianza baja)' : 'Detectado automáticamente por Vision AI',
        ...(ok ? { omittedSteps: r.omitted, stepsSource: 'vision' as const } : {}),
      };
      addCycle(record);
    });
    toast.success(`${cycles.length} ciclos enviados al estudio de ${op.name}` + (usable ? ` (${withSteps} con tiempos por paso)` : ''));
    onClear();
  };

  const label = STATUS_LABEL[status];
  const teachIdx = teaching ? teaching.length - 1 : -1;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Repeat className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold text-foreground">Ciclos automáticos</h3>
        <span className={`ml-auto text-[11px] font-medium ${label.color}`}>{label.text}</span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Con la sesión iniciada, pide al operario que ponga las manos donde empieza cada ciclo y pulsa
        <strong className="text-foreground"> Marcar posición inicial</strong>. Cada vez que las manos salgan y
        vuelvan se registra un ciclo.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={onCalibrate} disabled={!isActive} className="btn-primary-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
          <Crosshair className="w-3.5 h-3.5" /> Marcar posición inicial
        </button>
        <button onClick={onClear} disabled={!cycles.length} className="btn-secondary-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
          <RotateCcw className="w-3.5 h-3.5" /> Descartar
        </button>
      </div>

      {/* Pasos automáticos */}
      <div className="rounded-lg border border-border/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs font-semibold text-foreground">Pasos automáticos <span className="text-[10px] font-normal text-muted-foreground">(beta)</span></p>
        </div>

        {teaching ? (
          <div className="space-y-2" aria-live="polite">
            <p className="text-xs text-foreground">
              Grabando el ciclo de referencia · paso <strong>{teachIdx + 1}/{steps.length}</strong>: {steps[teachIdx]?.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {teachIdx < steps.length - 1 ? (
                <button onClick={nextTeachingStep} className="btn-accent-glass flex items-center gap-1.5 text-xs">
                  <SkipForward className="w-3.5 h-3.5" /> Empieza «{steps[teachIdx + 1]?.name}»
                </button>
              ) : (
                <button onClick={finishTeaching} className="btn-accent-glass flex items-center gap-1.5 text-xs">
                  <Flag className="w-3.5 h-3.5" /> Terminó el ciclo
                </button>
              )}
              <button onClick={() => setTeaching(null)} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            </div>
          </div>
        ) : usable ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-muted-foreground flex-1 min-w-[160px]">
              Método aprendido: {usable.steps.length} pasos (referencia de {usable.steps.reduce((s, x) => s + x.refDuration, 0).toFixed(1)} s).
              Cada ciclo trae sus tiempos por paso y los pasos omitidos.
            </p>
            <button onClick={startTeaching} disabled={!isActive} className="btn-secondary-glass text-xs disabled:opacity-40">Volver a enseñar</button>
            <button onClick={forgetTemplate} aria-label="Olvidar el método aprendido" className="btn-secondary-glass p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {template
                ? 'Los pasos del estudio cambiaron desde que se enseñó el método: vuelve a enseñarlo.'
                : 'Enseña el método una vez: con la cámara viendo al operario, pulsa Enseñar cuando empiece el paso 1 y marca el inicio de cada paso durante un ciclo. Después Kronos reconoce solo los pasos de cada ciclo y avisa si se omite alguno.'}
            </p>
            <button onClick={startTeaching} disabled={!isActive || steps.length < 2} className="btn-primary-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
              <GraduationCap className="w-3.5 h-3.5" /> Enseñar el método
            </button>
          </div>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/20 py-2">
            <p className="text-lg font-mono font-bold text-foreground">{cycles.length}</p>
            <p className="text-[10px] text-muted-foreground">ciclos</p>
          </div>
          <div className="rounded-lg bg-muted/20 py-2">
            <p className="text-lg font-mono font-bold text-foreground">{stats.mean.toFixed(1)}s</p>
            <p className="text-[10px] text-muted-foreground">promedio</p>
          </div>
          <div className="rounded-lg bg-muted/20 py-2">
            <p className="text-lg font-mono font-bold text-foreground">{stats.cv.toFixed(0)}%</p>
            <p className="text-[10px] text-muted-foreground">variación</p>
          </div>
        </div>
      )}

      {cycles.length > 0 && (
        <div className="max-h-48 overflow-y-auto scroll-thin space-y-1">
          {cycles.map((c, i) => {
            const r = recognized[i];
            return (
              <div key={c.end} className="px-2 py-1 rounded bg-muted/10 space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-muted-foreground">#{i + 1}</span>
                  {r && <span className={`text-[10px] ${CONF_CLS[r.confidence]}`}>confianza {r.confidence}</span>}
                  <span className="text-foreground">{c.duration.toFixed(1)} s</span>
                </div>
                {r && (
                  <div className="flex flex-wrap gap-1">
                    {r.steps.map(s => (
                      <span key={s.stepNumber} title={`${stepName(s.stepNumber)} · ${s.duration.toFixed(1)} s`}
                        className="px-1.5 rounded border border-success/40 bg-success/10 text-success text-[10px] font-mono">
                        {s.stepNumber}·{s.duration.toFixed(1)}
                      </span>
                    ))}
                    {r.omitted.map(n => (
                      <span key={`o${n}`} title={`${stepName(n)}: omitido`}
                        className="px-1.5 rounded border border-destructive/40 bg-destructive/10 text-destructive text-[10px] font-mono line-through">
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cycles.length > 0 && operators.length > 0 && (
        <div className="flex gap-2">
          <select
            value={operatorId}
            onChange={e => setOperatorId(Number(e.target.value))}
            className="input-glass flex-1 text-xs py-1.5"
            aria-label="Operario"
          >
            {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button onClick={handleSend} className="btn-primary-glass flex items-center gap-1.5 text-xs">
            <Send className="w-3.5 h-3.5" /> Enviar al estudio
          </button>
        </div>
      )}
    </div>
  );
};

export default AutoCyclePanel;
