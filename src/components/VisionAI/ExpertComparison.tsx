import React, { useState } from 'react';
import { ExpertTemplate, TherbligEvent, TherbligType } from './types';
import { THERBLIG_INFO } from './utils';
import { Trophy, Mic, MicOff, Users, TrendingUp } from 'lucide-react';

interface Props {
  currentHistory: TherbligEvent[];
  onSaveTemplate: (t: ExpertTemplate) => void;
  template: ExpertTemplate | null;
}

const ExpertComparison: React.FC<Props> = ({ currentHistory, onSaveTemplate, template }) => {
  const [expertName, setExpertName] = useState('Experto #1');
  const [recording, setRecording] = useState(false);
  const [recordStart, setRecordStart] = useState(0);
  const [recordedEvents, setRecordedEvents] = useState<TherbligEvent[]>([]);

  const startRecord = () => {
    setRecordStart(Date.now());
    setRecordedEvents([...currentHistory]);
    setRecording(true);
  };

  const stopRecord = () => {
    const slice = currentHistory.filter(e => e.startTime >= recordStart);
    const totalMs = slice.reduce((s, e) => s + e.duration, 0) || 1;
    const effMs = slice.filter(e => THERBLIG_INFO[e.type]?.efficient).reduce((s, e) => s + e.duration, 0);
    const byType: Record<string, number> = {};
    slice.forEach(e => { byType[e.type] = (byType[e.type] || 0) + e.duration; });
    const therbligs = Object.entries(byType).map(([type, duration]) => ({ type: type as TherbligType, duration }));

    onSaveTemplate({
      name: expertName,
      recordedAt: recordStart,
      therbligs,
      avgEfficiency: Math.round((effMs / totalMs) * 100),
    });
    setRecording(false);
  };

  const currentEffPct = (() => {
    const recent = currentHistory.slice(-60);
    if (!recent.length) return 0;
    const total = recent.reduce((s, e) => s + e.duration, 0) || 1;
    const eff = recent.filter(e => THERBLIG_INFO[e.type]?.efficient).reduce((s, e) => s + e.duration, 0);
    return Math.round((eff / total) * 100);
  })();

  const delta = template ? currentEffPct - template.avgEfficiency : 0;

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm text-foreground">Modo Comparación</h3>
      </div>

      {/* Record expert */}
      <div className="space-y-2">
        <input
          value={expertName}
          onChange={e => setExpertName(e.target.value)}
          className="input-glass w-full text-sm"
          placeholder="Nombre del experto"
        />
        {!recording ? (
          <button onClick={startRecord} className="btn-accent-glass w-full flex items-center justify-center gap-2 text-sm">
            <Mic className="w-3.5 h-3.5" />
            Grabar movimientos del experto
          </button>
        ) : (
          <button onClick={stopRecord} className="btn-danger-glass w-full flex items-center justify-center gap-2 text-sm animate-pulse">
            <MicOff className="w-3.5 h-3.5" />
            Detener grabación
          </button>
        )}
      </div>

      {/* Comparison */}
      {template && (
        <div className="space-y-3 border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            <p className="text-xs font-semibold text-foreground">vs {template.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
              <p className="text-xs text-muted-foreground mb-1">{template.name}</p>
              <p className="text-2xl font-bold font-mono text-yellow-400">{template.avgEfficiency}%</p>
              <p className="text-xs text-muted-foreground">eficiencia</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
              <p className="text-xs text-muted-foreground mb-1">Tú ahora</p>
              <p className="text-2xl font-bold font-mono" style={{ color: delta >= 0 ? '#34d399' : '#f43f5e' }}>{currentEffPct}%</p>
              <p className="text-xs text-muted-foreground">eficiencia</p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: delta >= 0 ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${delta >= 0 ? '#34d39933' : '#f43f5e33'}` }}>
            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: delta >= 0 ? '#34d399' : '#f43f5e' }} />
            <p className="text-xs" style={{ color: delta >= 0 ? '#34d399' : '#f43f5e' }}>
              {delta >= 0
                ? `+${delta}% sobre el experto — ¡excelente!`
                : `${delta}% por debajo del experto — a mejorar`}
            </p>
          </div>

          {/* Expert therblig breakdown */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Distribución del experto</p>
            {template.therbligs.slice(0, 5).map(({ type, duration }) => {
              const info = THERBLIG_INFO[type];
              const total = template.therbligs.reduce((s, t) => s + t.duration, 0) || 1;
              const pct = Math.round((duration / total) * 100);
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-8 text-xs font-mono font-bold" style={{ color: info?.color }}>{type}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: info?.color }} />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!template && !recording && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Graba los movimientos del operario más eficiente para comparar en tiempo real.
        </p>
      )}
    </div>
  );
};

export default ExpertComparison;
