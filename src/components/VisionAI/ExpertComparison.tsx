import React, { useState } from 'react';
import { ExpertTemplate, TherbligEvent, TherbligType } from './types';
import { THERBLIG_INFO } from './utils';
import { Trophy, Plus, Trash2, Users, TrendingUp, Layers, CheckCircle2 } from 'lucide-react';

interface Props {
  currentHistory: TherbligEvent[];
  onSaveTemplate: (t: ExpertTemplate) => void;
  template: ExpertTemplate | null;
}

/** One recorded take: per-therblig durations + overall efficiency. */
interface Sample {
  byType: Record<string, number>;
  efficiency: number;
}

const MIN_SAMPLES = 3;

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map(v => (v - m) ** 2)));
}

const ExpertComparison: React.FC<Props> = ({ currentHistory, onSaveTemplate, template }) => {
  const [expertName, setExpertName] = useState('Experto #1');
  const [samples, setSamples] = useState<Sample[]>([]);
  // marca de tiempo desde la que se mide la próxima muestra
  const [sampleStart, setSampleStart] = useState(() => Date.now());

  /** Build a benchmark (averaged + tolerance band + consistency) from samples. */
  const buildTemplate = (allSamples: Sample[]): ExpertTemplate => {
    const types = new Set<string>();
    allSamples.forEach(s => Object.keys(s.byType).forEach(t => types.add(t)));

    const therbligs = Array.from(types).map(type => {
      const durations = allSamples.map(s => s.byType[type] || 0);
      return {
        type: type as TherbligType,
        duration: Math.round(mean(durations)),
        tolerance: Math.round(stdDev(durations)),
      };
    }).sort((a, b) => b.duration - a.duration);

    const effs = allSamples.map(s => s.efficiency);
    const avgEfficiency = Math.round(mean(effs));
    // consistencia: 100 - dispersión relativa de la eficiencia entre muestras
    const consistency = effs.length < 2
      ? 100
      : Math.max(0, Math.round(100 - stdDev(effs)));

    return {
      name: expertName,
      recordedAt: Date.now(),
      therbligs,
      avgEfficiency,
      samples: allSamples.length,
      consistency,
    };
  };

  const recordSample = () => {
    const now = Date.now();
    const slice = currentHistory.filter(e => e.startTime >= sampleStart);
    if (!slice.length) { setSampleStart(now); return; }

    const totalMs = slice.reduce((s, e) => s + e.duration, 0) || 1;
    const effMs = slice.filter(e => THERBLIG_INFO[e.type]?.efficient).reduce((s, e) => s + e.duration, 0);
    const byType: Record<string, number> = {};
    slice.forEach(e => { byType[e.type] = (byType[e.type] || 0) + e.duration; });

    const sample: Sample = { byType, efficiency: Math.round((effMs / totalMs) * 100) };
    const next = [...samples, sample];
    setSamples(next);
    setSampleStart(now);
    onSaveTemplate(buildTemplate(next));
  };

  const clearSamples = () => {
    setSamples([]);
    setSampleStart(Date.now());
  };

  const currentEffPct = (() => {
    const recent = currentHistory.slice(-60);
    if (!recent.length) return 0;
    const total = recent.reduce((s, e) => s + e.duration, 0) || 1;
    const eff = recent.filter(e => THERBLIG_INFO[e.type]?.efficient).reduce((s, e) => s + e.duration, 0);
    return Math.round((eff / total) * 100);
  })();

  const delta = template ? currentEffPct - template.avgEfficiency : 0;
  const progressPct = Math.min(100, Math.round((samples.length / MIN_SAMPLES) * 100));
  const consistency = template?.consistency ?? 0;
  const consistencyColor = consistency >= 80 ? '#34d399' : consistency >= 55 ? '#fbbf24' : '#f43f5e';

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm text-foreground">Entrenamiento del experto</h3>
        {samples.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs font-mono text-accent">
            <Layers className="w-3.5 h-3.5" /> muestras: {samples.length}
          </span>
        )}
      </div>

      {/* Record samples */}
      <div className="space-y-2">
        <input
          value={expertName}
          onChange={e => setExpertName(e.target.value)}
          className="input-glass w-full text-sm"
          placeholder="Nombre del experto"
        />
        <div className="flex gap-2">
          <button onClick={recordSample} className="btn-accent-glass flex-1 flex items-center justify-center gap-2 text-sm">
            <Plus className="w-3.5 h-3.5" />
            Grabar muestra
          </button>
          {samples.length > 0 && (
            <button onClick={clearSamples} className="btn-secondary-glass flex items-center justify-center gap-1.5 text-sm" title="Borrar muestras">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Progress towards recommended minimum */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Progreso de entrenamiento</span>
            <span className="font-mono">{samples.length}/{MIN_SAMPLES} recomendadas</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, background: samples.length >= MIN_SAMPLES ? '#34d399' : '#22d3ee' }}
            />
          </div>
          {samples.length >= MIN_SAMPLES && (
            <p className="flex items-center gap-1 text-[11px] text-success">
              <CheckCircle2 className="w-3 h-3" /> Benchmark robusto listo
            </p>
          )}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Cada muestra captura una repetición del experto. El benchmark promedia varias tomas y calcula su banda de tolerancia.
        </p>
      </div>

      {/* Comparison */}
      {template && (
        <div className="space-y-3 border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            <p className="text-xs font-semibold text-foreground">
              vs {template.name}
              {template.samples ? <span className="text-muted-foreground font-normal"> · {template.samples} muestras</span> : null}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
              <p className="text-xs text-muted-foreground mb-1">{template.name}</p>
              <p className="text-2xl font-bold font-mono text-yellow-400">{template.avgEfficiency}%</p>
              <p className="text-xs text-muted-foreground">eficiencia media</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
              <p className="text-xs text-muted-foreground mb-1">Operario ahora</p>
              <p className="text-2xl font-bold font-mono" style={{ color: delta >= 0 ? '#34d399' : '#f43f5e' }}>{currentEffPct}%</p>
              <p className="text-xs text-muted-foreground">eficiencia</p>
            </div>
          </div>

          {/* Consistency score */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <div className="flex-shrink-0 text-xs text-muted-foreground">Consistencia del experto</div>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${consistency}%`, background: consistencyColor }} />
            </div>
            <span className="text-xs font-mono font-bold tabular-nums" style={{ color: consistencyColor }}>{consistency}%</span>
          </div>

          {/* Live delta */}
          <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: delta >= 0 ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${delta >= 0 ? '#34d39933' : '#f43f5e33'}` }}>
            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: delta >= 0 ? '#34d399' : '#f43f5e' }} />
            <p className="text-xs" style={{ color: delta >= 0 ? '#34d399' : '#f43f5e' }}>
              {delta >= 0
                ? `+${delta}% sobre el benchmark — ¡excelente!`
                : `${delta}% por debajo del benchmark — a mejorar`}
            </p>
          </div>

          {/* Expert therblig breakdown with tolerance band */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Distribución promedio (± tolerancia entre muestras)</p>
            {template.therbligs.slice(0, 5).map(({ type, duration, tolerance }) => {
              const info = THERBLIG_INFO[type];
              const total = template.therbligs.reduce((s, t) => s + t.duration, 0) || 1;
              const pct = Math.round((duration / total) * 100);
              const tolPct = tolerance ? Math.round((tolerance / total) * 100) : 0;
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-8 text-xs font-mono font-bold" style={{ color: info?.color }}>{type}</span>
                  <div className="relative flex-1 h-1.5 rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: info?.color }} />
                    {tolPct > 0 && (
                      <div
                        className="absolute top-0 h-full rounded-full opacity-40"
                        style={{ left: `${Math.max(0, pct - tolPct)}%`, width: `${Math.min(100, tolPct * 2)}%`, background: info?.color }}
                      />
                    )}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-14 text-right">
                    {pct}%{tolPct > 0 ? ` ±${tolPct}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!template && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Graba varias muestras del operario más eficiente para construir un benchmark promedio y comparar en tiempo real.
        </p>
      )}
    </div>
  );
};

export default ExpertComparison;
