import React, { useState, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Save, SkipForward, Trash2, User, CheckCircle2 } from "lucide-react";
import { useTimeStudy, CycleRecord, StepTiming, CRANE_STEPS } from "@/context/TimeStudyContext";

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
};

interface OperatorTimerProps {
  operatorId: number;
  operatorName: string;
}

const OperatorStepTimer: React.FC<OperatorTimerProps> = ({ operatorId, operatorName }) => {
  const { cycles, addCycle, removeCycle } = useTimeStudy();
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stepTimings, setStepTimings] = useState<StepTiming[]>([]);
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
      stepNumber: currentStep + 1,
      stepName: CRANE_STEPS[currentStep].name,
      duration: elapsed,
      timestamp: new Date(),
    };
    setStepTimings((prev) => [...prev, timing]);

    if (currentStep < CRANE_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setElapsed(0);
      startTimeRef.current = Date.now();
    } else {
      // All steps done — save cycle
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
  }, [elapsed, currentStep, stepTimings, operatorId, operatorName, cycleCount, addCycle]);

  const quickSave = useCallback(() => {
    if (elapsed < 0.3 && stepTimings.length === 0) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    const currentTiming: StepTiming = elapsed > 0.1
      ? { stepNumber: currentStep + 1, stepName: CRANE_STEPS[currentStep].name, duration: elapsed, timestamp: new Date() }
      : null as any;
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
  }, [elapsed, currentStep, stepTimings, operatorId, operatorName, cycleCount, addCycle]);

  const reset = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(0);
    setCurrentStep(0);
    setStepTimings([]);
  }, []);

  const avgTime = operatorCycles.length > 0
    ? operatorCycles.reduce((s, c) => s + c.duration, 0) / operatorCycles.length
    : 0;

  const step = CRANE_STEPS[currentStep];

  return (
    <div className="glass-card p-5 space-y-4 animate-fade-in">
      {/* Header */}
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

      {/* Current Step */}
      <div className="text-center space-y-1">
        <span className="text-2xl">{step.emoji}</span>
        <p className="text-xs font-medium text-primary">Paso {step.number}/12</p>
        <p className="text-sm text-foreground font-medium">{step.name}</p>
        <div className="timer-step-display">{formatTime(elapsed)}</div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-0.5">
        {CRANE_STEPS.map((s, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              i < currentStep
                ? "bg-success/60"
                : i === currentStep
                ? "bg-primary/80"
                : "bg-muted/40"
            }`}
          />
        ))}
      </div>

      {/* Controls */}
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
        <button onClick={nextStep} disabled={elapsed < 0.1} className="btn-accent-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
          <SkipForward className="w-3.5 h-3.5" />
          {currentStep < CRANE_STEPS.length - 1 ? "Siguiente" : "Finalizar"}
        </button>
        <button onClick={reset} className="btn-secondary-glass flex items-center gap-1.5 text-xs">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button onClick={quickSave} disabled={stepTimings.length === 0 && elapsed < 0.3} className="btn-secondary-glass flex items-center gap-1.5 text-xs disabled:opacity-40">
          <Save className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Step timings done */}
      {stepTimings.length > 0 && (
        <div className="space-y-1 max-h-28 overflow-y-auto scroll-thin">
          {stepTimings.map((t, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-success/5 border border-success/10">
              <span className="text-muted-foreground">{CRANE_STEPS[i].emoji} {t.stepName}</span>
              <span className="font-mono text-success">{formatTime(t.duration)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent cycles */}
      {operatorCycles.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Últimos ciclos</p>
          {operatorCycles.slice(-3).reverse().map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono">#{c.cycleNumber}</span>
                <span className="text-[10px] text-muted-foreground">{c.steps.length} pasos</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-foreground">{formatTime(c.duration)}</span>
                <button onClick={() => removeCycle(c.id)} className="text-destructive/50 hover:text-destructive p-0.5">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StepTimer: React.FC = () => {
  const { operators } = useTimeStudy();

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-primary" />
        <div>
          <p className="text-sm font-display font-bold text-foreground">Cronómetro de 12 Pasos — Grulla de Origami</p>
          <p className="text-xs text-muted-foreground">Mide cada paso del proceso para identificar cuellos de botella</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {operators.map((op) => (
          <OperatorStepTimer key={op.id} operatorId={op.id} operatorName={op.name} />
        ))}
      </div>
    </div>
  );
};

export default StepTimer;
