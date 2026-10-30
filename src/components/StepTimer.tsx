/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, RotateCcw, Save, SkipForward, Trash2, User, CheckCircle2, Edit2, Check, X, Ban, Flag, AlertTriangle, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { useTimeStudy, CycleRecord, StepTiming } from "@/context/TimeStudyContext";
import { liveDeviations, nextPendingIndex } from "@/lib/sequence";

const OBSERVED_MODE_KEY = "kronos_sequence_mode_v1";

const parseTimeInput = (val: string): number => {
  const parts = val.split(":");
  if (parts.length === 1) return parseFloat(parts[0]) || 0;
  const mins = parseInt(parts[0]) || 0;
  const secParts = parts[1].split(".");
  const secs = parseInt(secParts[0]) || 0;
  const ms = secParts[1] ? parseInt(secParts[1]) / 100 : 0;
  return mins * 60 + secs + ms;
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
};

interface OperatorTimerProps {
  operatorId: number;
  operatorName: string;
  /** Secuencia observada: el observador marca el paso real que se hace, en el orden en que ocurre. */
  observedMode: boolean;
}

const OperatorStepTimer: React.FC<OperatorTimerProps> = ({ operatorId, operatorName, observedMode }) => {
  const { cycles, addCycle, removeCycle, updateCycle, steps } = useTimeStudy();
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stepTimings, setStepTimings] = useState<StepTiming[]>([]);
  const [omitted, setOmitted] = useState<number[]>([]);
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [editStepTimes, setEditStepTimes] = useState<string[]>([]);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const operatorCycles = cycles.filter((c) => c.operatorId === operatorId);
  const cycleCount = operatorCycles.length;

  const start = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    startTimeRef.current = Date.now() - elapsed * 1000;
    intervalRef.current = window.setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000);
    }, 50);
  }, [isRunning, elapsed]);

  const pause = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const nextStep = useCallback(() => {
    if (elapsed < 0.1) return;
    const timing: StepTiming = {
      stepNumber: steps[currentStep].number,
      stepName: steps[currentStep].name,
      duration: elapsed,
      timestamp: new Date(),
    };
    setStepTimings((prev) => [...prev, timing]);

    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setElapsed(0);
      startTimeRef.current = Date.now();
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsRunning(false);
      const allTimings = [...stepTimings, timing];
      const totalDuration = allTimings.reduce((s, t) => s + t.duration, 0);
      const cycle: CycleRecord = {
        id: crypto.randomUUID(),
        operatorId,
        operatorName,
        cycleNumber: cycleCount + 1,
        duration: totalDuration,
        steps: allTimings,
        timestamp: new Date(),
        qualityPass: true,
        defects: [],
        notes: "",
      };
      addCycle(cycle);
      setCurrentStep(0);
      setElapsed(0);
      setStepTimings([]);
    }
  }, [elapsed, currentStep, stepTimings, operatorId, operatorName, cycleCount, addCycle, steps]);

  const quickSave = useCallback(() => {
    if (elapsed < 0.3 && stepTimings.length === 0) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    const currentTiming: StepTiming | null = elapsed > 0.1
      ? { stepNumber: steps[currentStep].number, stepName: steps[currentStep].name, duration: elapsed, timestamp: new Date() }
      : null;
    const allTimings = currentTiming ? [...stepTimings, currentTiming] : stepTimings;
    if (allTimings.length === 0) return;
    const totalDuration = allTimings.reduce((s, t) => s + t.duration, 0);
    const cycle: CycleRecord = {
      id: crypto.randomUUID(),
      operatorId,
      operatorName,
      cycleNumber: cycleCount + 1,
      duration: totalDuration,
      steps: allTimings,
      timestamp: new Date(),
      qualityPass: true,
      defects: [],
      notes: "",
    };
    addCycle(cycle);
    setCurrentStep(0);
    setElapsed(0);
    setStepTimings([]);
  }, [elapsed, currentStep, stepTimings, operatorId, operatorName, cycleCount, addCycle, steps]);

  const reset = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(0);
    setCurrentStep(0);
    setStepTimings([]);
    setOmitted([]);
  }, []);

  // Al cambiar de modo se descarta el ciclo en curso: mezclar los dos registros daría un orden falso.
  useEffect(() => { reset(); }, [observedMode, reset]);

  // ── Modo secuencia observada ──
  const restartClock = () => {
    setElapsed(0);
    startTimeRef.current = Date.now();
    if (!isRunning) {
      setIsRunning(true);
      intervalRef.current = window.setInterval(() => {
        setElapsed((Date.now() - startTimeRef.current) / 1000);
      }, 50);
    }
  };

  /** Tiempo del paso en curso (si ya corrió) añadido a lo registrado. */
  const withCurrent = (): StepTiming[] =>
    elapsed >= 0.1
      ? [...stepTimings, { stepNumber: steps[currentStep].number, stepName: steps[currentStep].name, duration: elapsed, timestamp: new Date() }]
      : stepTimings;

  const saveObserved = (timings: StepTiming[], skipped: number[]) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    const done = new Set(timings.map((t) => t.stepNumber));
    // Al finalizar, lo que no se hizo queda como omitido (el observador lo confirma al cerrar).
    const allOmitted = [...new Set([...skipped, ...steps.map((s) => s.number).filter((n) => !done.has(n))])];
    if (timings.length > 0) {
      addCycle({
        id: crypto.randomUUID(),
        operatorId,
        operatorName,
        cycleNumber: cycleCount + 1,
        duration: timings.reduce((s, t) => s + t.duration, 0),
        steps: timings,
        timestamp: new Date(),
        qualityPass: true,
        defects: [],
        notes: "",
        omittedSteps: allOmitted,
        sequenceMode: "observada",
      });
      const devs = liveDeviations(steps, timings.map((t) => t.stepNumber), allOmitted);
      if (devs.length > 0) {
        toast.warning(`Ciclo de ${operatorName} con desviaciones del método`, { description: devs.map((d) => d.detail).join(" · ") });
      }
    }
    setCurrentStep(0);
    setElapsed(0);
    setStepTimings([]);
    setOmitted([]);
  };

  const goTo = (timings: StepTiming[], skipped: number[], from: number) => {
    const done = new Set([...timings.map((t) => t.stepNumber), ...skipped]);
    const idx = nextPendingIndex(steps, done, from);
    if (idx === -1) {
      saveObserved(timings, skipped);
      return;
    }
    setStepTimings(timings);
    setOmitted(skipped);
    setCurrentStep(idx);
    restartClock();
  };

  const observedNext = () => goTo(withCurrent(), omitted, currentStep);

  const observedSkip = () => {
    const n = steps[currentStep].number;
    goTo(stepTimings, omitted.includes(n) ? omitted : [...omitted, n], currentStep);
  };

  const observedJump = (i: number) => {
    if (i === currentStep) return;
    setStepTimings(withCurrent());
    setOmitted((o) => o.filter((n) => n !== steps[i].number));
    setCurrentStep(i);
    restartClock();
  };

  const live = observedMode ? liveDeviations(steps, stepTimings.map((t) => t.stepNumber), omitted) : [];

  const avgTime = operatorCycles.length > 0
    ? operatorCycles.reduce((s, c) => s + c.duration, 0) / operatorCycles.length
    : 0;

  const step = steps[currentStep];
  if (!step) return null;

  return (
    <div className="glass-card p-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground text-sm">{operatorName}</h3>
            <p className="text-[10px] text-muted-foreground">Ciclo #{cycleCount + 1}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && <div className="recording-dot" />}
          <span className="text-xs font-mono text-muted-foreground bg-muted/30 px-2 py-1 rounded">
            {formatTime(avgTime)} avg
          </span>
        </div>
      </div>

      <div className="text-center space-y-1">
        <span className="text-2xl">{step.emoji}</span>
        <p className="text-xs font-medium text-primary">Paso {step.number}/{steps.length}</p>
        <p className="text-sm text-foreground font-medium">{step.name}</p>
        <div className="timer-step-display">{formatTime(elapsed)}</div>
      </div>

      {observedMode ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Paso que se está haciendo">
          {steps.map((s, i) => {
            const done = stepTimings.some((t) => t.stepNumber === s.number);
            const skipped = omitted.includes(s.number);
            const cls = i === currentStep
              ? "bg-primary/25 border-primary text-foreground"
              : skipped ? "bg-destructive/10 border-destructive/40 text-destructive line-through"
              : done ? "bg-success/15 border-success/40 text-success"
              : "bg-muted/20 border-border/40 text-muted-foreground";
            return (
              <button key={s.number} type="button" onClick={() => observedJump(i)} aria-pressed={i === currentStep}
                aria-label={`Ahora hace el paso ${s.number}: ${s.name}`} title={s.name}
                className={`min-w-[2rem] px-1.5 py-1 rounded-md border text-[11px] font-mono transition-colors ${cls}`}>
                {s.number}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-0.5">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i < currentStep ? "bg-success/60" : i === currentStep ? "bg-primary/80" : "bg-muted/40"
              }`}
            />
          ))}
        </div>
      )}

      {live.length > 0 && (
        <ul className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 space-y-0.5" aria-live="polite">
          {live.map((d, i) => (
            <li key={i} className="text-[11px] text-warning flex gap-1.5">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {d.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-center gap-2 flex-wrap">
        {!isRunning ? (
          <button onClick={start} className="btn-primary-glass flex items-center gap-1.5 text-xs">
            <Play className="w-3.5 h-3.5" /> Iniciar
          </button>
        ) : (
          <button onClick={pause} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
            <Pause className="w-3.5 h-3.5" /> Pausar
          </button>
        )}
        {observedMode ? (
          <>
            <button onClick={observedNext} disabled={elapsed < 0.1} className="btn-accent-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
              <SkipForward className="w-3.5 h-3.5" /> Siguiente
            </button>
            <button onClick={observedSkip} className="btn-secondary-glass flex items-center gap-1.5 text-xs" title="El operario no hizo este paso">
              <Ban className="w-3.5 h-3.5" /> Omitido
            </button>
            <button onClick={() => saveObserved(withCurrent(), omitted)} disabled={stepTimings.length === 0 && elapsed < 0.1}
              className="btn-secondary-glass flex items-center gap-1.5 text-xs disabled:opacity-40" title="Cierra el ciclo; los pasos sin hacer quedan como omitidos">
              <Flag className="w-3.5 h-3.5" /> Finalizar
            </button>
          </>
        ) : (
          <button onClick={nextStep} disabled={elapsed < 0.1} className="btn-accent-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
            <SkipForward className="w-3.5 h-3.5" />
            {currentStep < steps.length - 1 ? "Siguiente" : "Finalizar"}
          </button>
        )}
        <button onClick={reset} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        {!observedMode && (
          <button onClick={quickSave} disabled={stepTimings.length === 0 && elapsed < 0.3} className="btn-secondary-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
            <Save className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {stepTimings.length > 0 && (
        <div className="space-y-1 max-h-28 overflow-y-auto scroll-thin">
          {stepTimings.map((t, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-success/5 border border-success/10">
              <span className="text-muted-foreground">{steps.find((s) => s.number === t.stepNumber)?.emoji} {t.stepName}</span>
              <span className="font-mono text-success">{formatTime(t.duration)}</span>
            </div>
          ))}
        </div>
      )}

      {operatorCycles.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Últimos ciclos</p>
          {operatorCycles.slice(-3).reverse().map((c) => (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono">#{c.cycleNumber}</span>
                  <span className="text-[10px] text-muted-foreground">{c.steps.length} pasos</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-foreground">{formatTime(c.duration)}</span>
                  {editingCycleId === c.id ? (
                    <>
                      <button onClick={() => {
                        const newSteps: StepTiming[] = steps.map((step, i) => ({
                          stepNumber: step.number,
                          stepName: step.name,
                          duration: parseTimeInput(editStepTimes[i] || "0"),
                          timestamp: new Date(),
                        }));
                        updateCycle(c.id, { steps: newSteps });
                        setEditingCycleId(null);
                      }} className="text-success hover:text-success/80 p-0.5"><Check className="w-3 h-3" /></button>
                      <button onClick={() => setEditingCycleId(null)} className="text-muted-foreground hover:text-foreground p-0.5"><X className="w-3 h-3" /></button>
                    </>
                  ) : (
                    <button onClick={() => {
                      setEditingCycleId(c.id);
                      setEditStepTimes(steps.map((step) => {
                        const found = c.steps.find((s) => s.stepNumber === step.number);
                        return found ? formatTime(found.duration) : "0";
                      }));
                    }} className="text-muted-foreground hover:text-primary p-0.5"><Edit2 className="w-3 h-3" /></button>
                  )}
                  <button onClick={() => removeCycle(c.id)} className="text-destructive/50 hover:text-destructive p-0.5">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {editingCycleId === c.id && (
                <div className="grid grid-cols-2 gap-1 px-2 pb-1">
                  {steps.map((step, i) => (
                    <div key={step.number} className="flex items-center gap-1">
                      <span className="text-[9px] text-muted-foreground truncate w-16">{step.emoji}{step.name.slice(0,8)}</span>
                      <input
                        value={editStepTimes[i] || ""}
                        onChange={(e) => {
                          const arr = [...editStepTimes];
                          arr[i] = e.target.value;
                          setEditStepTimes(arr);
                        }}
                        className="input-glass text-[10px] py-0.5 font-mono flex-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StepTimer: React.FC = () => {
  const { operators } = useTimeStudy();
  const [observedMode, setObservedMode] = useState(() => {
    try {
      return localStorage.getItem(OBSERVED_MODE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleMode = () => {
    setObservedMode((m) => {
      try {
        localStorage.setItem(OBSERVED_MODE_KEY, m ? "0" : "1");
      } catch {
        /* almacenamiento no disponible */
      }
      return !m;
    });
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-display font-bold text-foreground">Cronómetro por Pasos</p>
          <p className="text-xs text-muted-foreground">
            {observedMode
              ? "Secuencia observada: toca el paso que el operario está haciendo. Kronos avisa si se salta o cambia el orden del método."
              : "Mide cada paso del proceso para identificar cuellos de botella"}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={observedMode} onClick={toggleMode}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${observedMode ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground"}`}>
          <Shuffle className="w-3.5 h-3.5" /> Secuencia observada
        </button>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {operators.map((op) => (
          <OperatorStepTimer key={op.id} operatorId={op.id} operatorName={op.name} observedMode={observedMode} />
        ))}
      </div>
    </div>
  );
};

export default StepTimer;
