/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useMemo, useState } from 'react';
import { Crosshair, RotateCcw, Send, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { useTimeStudy, type CycleRecord } from '@/context/TimeStudyContext';
import type { CycleDetectorState, DetectedCycle } from '@/lib/cycleDetector';

interface Props {
  status: CycleDetectorState;
  cycles: DetectedCycle[];
  isActive: boolean;
  onCalibrate: () => void;
  onClear: () => void;
}

const STATUS_LABEL: Record<CycleDetectorState, { text: string; color: string }> = {
  uncalibrated: { text: 'Sin posición inicial', color: 'text-muted-foreground' },
  home:         { text: 'Manos en posición inicial', color: 'text-emerald-400' },
  away:         { text: 'Ciclo en curso', color: 'text-primary' },
};

/** Cronómetro sin cronometrista: los ciclos se detectan solos y se envían al estudio de tiempos. */
const AutoCyclePanel: React.FC<Props> = ({ status, cycles, isActive, onCalibrate, onClear }) => {
  const { operators, cycles: studyCycles, addCycle } = useTimeStudy();
  const [operatorId, setOperatorId] = useState<number>(operators[0]?.id ?? 0);

  const stats = useMemo(() => {
    if (!cycles.length) return null;
    const d = cycles.map(c => c.duration);
    const mean = d.reduce((s, x) => s + x, 0) / d.length;
    const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, d.length - 1));
    return { mean, cv: mean > 0 ? (sd / mean) * 100 : 0 };
  }, [cycles]);

  const handleSend = () => {
    const op = operators.find(o => o.id === operatorId);
    if (!op || !cycles.length) return;
    const already = studyCycles.filter(c => c.operatorId === op.id).length;
    cycles.forEach((c, i) => {
      const record: CycleRecord = {
        id: crypto.randomUUID(),
        operatorId: op.id,
        operatorName: op.name,
        cycleNumber: already + i + 1,
        duration: Math.round(c.duration * 100) / 100,
        steps: [],
        timestamp: new Date(c.end),
        qualityPass: true,
        defects: [],
        notes: 'Detectado automáticamente por Vision AI',
      };
      addCycle(record);
    });
    toast.success(`${cycles.length} ciclos enviados al estudio de ${op.name}`);
    onClear();
  };

  const label = STATUS_LABEL[status];

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
        <div className="max-h-32 overflow-y-auto scroll-thin space-y-1">
          {cycles.map((c, i) => (
            <div key={c.end} className="flex justify-between text-xs font-mono px-2 py-1 rounded bg-muted/10">
              <span className="text-muted-foreground">#{i + 1}</span>
              <span className="text-foreground">{c.duration.toFixed(1)} s</span>
            </div>
          ))}
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
