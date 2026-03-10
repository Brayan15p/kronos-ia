import React, { useState, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Save, User, Trash2 } from "lucide-react";
import { useTimeStudy, CycleRecord } from "@/context/TimeStudyContext";

interface Props {
  operatorId: number;
  operatorName: string;
}

const OperatorTimer: React.FC<Props> = ({ operatorId, operatorName }) => {
  const { cycles, addCycle, removeCycle } = useTimeStudy();
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const operatorCycles = cycles.filter((c) => c.operatorId === operatorId);
  const cycleCount = operatorCycles.length;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

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

  const reset = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(0);
  }, []);

  const saveCycle = useCallback(() => {
    if (elapsed < 0.5) return;
    const cycle: CycleRecord = {
      id: crypto.randomUUID(),
      operatorId,
      operatorName,
      cycleNumber: cycleCount + 1,
      duration: elapsed,
      timestamp: new Date(),
      qualityPass: true,
      defects: [],
      notes: "",
    };
    addCycle(cycle);
    reset();
  }, [elapsed, operatorId, operatorName, cycleCount, addCycle, reset]);

  const avgTime = operatorCycles.length > 0
    ? operatorCycles.reduce((sum, c) => sum + c.duration, 0) / operatorCycles.length
    : 0;

  const bestTime = operatorCycles.length > 0
    ? Math.min(...operatorCycles.map((c) => c.duration))
    : 0;

  return (
    <div className="glass-card p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{operatorName}</h3>
            <p className="text-xs text-muted-foreground">Operario {operatorId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && <div className="recording-dot" />}
          <span className="text-xs font-mono text-muted-foreground">
            Ciclo #{cycleCount + 1}
          </span>
        </div>
      </div>

      {/* Timer Display */}
      <div className="text-center py-4">
        <div className="timer-display">{formatTime(elapsed)}</div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {!isRunning ? (
          <button onClick={start} className="btn-primary-glass flex items-center gap-2">
            <Play className="w-4 h-4" /> Iniciar
          </button>
        ) : (
          <button onClick={pause} className="btn-secondary-glass flex items-center gap-2">
            <Pause className="w-4 h-4" /> Pausar
          </button>
        )}
        <button onClick={reset} className="btn-secondary-glass flex items-center gap-2">
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
        <button
          onClick={saveCycle}
          disabled={elapsed < 0.5}
          className="btn-primary-glass flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" /> Guardar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-2">
        <div className="glass-card p-3 text-center">
          <div className="stat-value text-xl text-foreground">{cycleCount}</div>
          <div className="stat-label">Ciclos</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="stat-value text-xl text-primary">{formatTime(avgTime)}</div>
          <div className="stat-label">Promedio</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="stat-value text-xl text-success">{formatTime(bestTime)}</div>
          <div className="stat-label">Mejor</div>
        </div>
      </div>

      {/* Recent cycles */}
      {operatorCycles.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Últimos ciclos</p>
          {operatorCycles.slice(-5).reverse().map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/30">
              <span className="text-muted-foreground font-mono">#{c.cycleNumber}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-foreground">{formatTime(c.duration)}</span>
                <button
                  onClick={() => removeCycle(c.id)}
                  className="text-destructive/60 hover:text-destructive transition-colors p-0.5"
                  title="Eliminar ciclo"
                >
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

export default OperatorTimer;
