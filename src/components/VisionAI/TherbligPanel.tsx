import React, { useMemo } from 'react';
import { TherbligType, TherbligEvent } from './types';
import { THERBLIG_INFO } from './utils';
import { Zap, Clock, TrendingUp } from 'lucide-react';

interface Props {
  currentLeft: TherbligType | null;
  currentRight: TherbligType | null;
  history: TherbligEvent[];
  sessionSeconds: number;
}

const TherbligBadge: React.FC<{ type: TherbligType; active?: boolean }> = ({ type, active }) => {
  const info = THERBLIG_INFO[type];
  if (!info) return null;
  return (
    <div
      title={info.desc}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all duration-200"
      style={{
        background: active ? info.bg : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? info.color + '55' : 'rgba(255,255,255,0.06)'}`,
        color: active ? info.color : '#64748b',
        boxShadow: active ? `0 0 12px -4px ${info.color}66` : 'none',
        transform: active ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      <span className="font-bold">{type}</span>
      <span className="opacity-70 hidden sm:inline">{info.label}</span>
      {!info.efficient && <span className="text-yellow-400">⚠</span>}
    </div>
  );
};

const TherbligPanel: React.FC<Props> = ({ currentLeft, currentRight, history, sessionSeconds }) => {
  const stats = useMemo(() => {
    const totalMs = history.reduce((s, e) => s + e.duration, 0) || 1;
    const efficient = history.filter(e => THERBLIG_INFO[e.type]?.efficient);
    const inefficient = history.filter(e => !THERBLIG_INFO[e.type]?.efficient);
    const effPct = Math.round((efficient.reduce((s, e) => s + e.duration, 0) / totalMs) * 100);
    const inPct = 100 - effPct;

    const byType: Record<string, number> = {};
    history.forEach(e => { byType[e.type] = (byType[e.type] || 0) + e.duration; });
    const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { effPct, inPct, sorted, totalEvents: history.length };
  }, [history]);

  const allTypes = Object.keys(THERBLIG_INFO) as TherbligType[];
  const effTypes = allTypes.filter(t => THERBLIG_INFO[t].efficient);
  const inTypes = allTypes.filter(t => !THERBLIG_INFO[t].efficient);

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">Therbligs en Vivo</h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span className="font-mono">{Math.floor(sessionSeconds / 60).toString().padStart(2, '0')}:{(sessionSeconds % 60).toString().padStart(2, '0')}</span>
        </div>
      </div>

      {/* Active Therbligs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Mano izquierda</p>
          {currentLeft
            ? <TherbligBadge type={currentLeft} active />
            : <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-muted-foreground">—</div>
          }
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Mano derecha</p>
          {currentRight
            ? <TherbligBadge type={currentRight} active />
            : <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-muted-foreground">—</div>
          }
        </div>
      </div>

      {/* Efficiency bars */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-green-400 font-semibold">Eficientes</span>
          <span className="font-mono text-green-400">{stats.effPct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${stats.effPct}%`, background: 'linear-gradient(90deg, #22d3ee, #34d399)' }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-red-400 font-semibold">Ineficientes</span>
          <span className="font-mono text-red-400">{stats.inPct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${stats.inPct}%`, background: 'linear-gradient(90deg, #f43f5e, #fb923c)' }}
          />
        </div>
      </div>

      {/* All therblig chips */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Eficientes</p>
        <div className="flex flex-wrap gap-1.5">
          {effTypes.map(t => (
            <TherbligBadge key={t} type={t} active={currentLeft === t || currentRight === t} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mt-2">Ineficientes</p>
        <div className="flex flex-wrap gap-1.5">
          {inTypes.map(t => (
            <TherbligBadge key={t} type={t} active={currentLeft === t || currentRight === t} />
          ))}
        </div>
      </div>

      {/* Top therbligs */}
      {stats.sorted.length > 0 && (
        <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Top de sesión ({stats.totalEvents} eventos)</p>
          </div>
          {stats.sorted.map(([type, ms]) => {
            const info = THERBLIG_INFO[type as TherbligType];
            const pct = Math.round((ms / (history.reduce((s, e) => s + e.duration, 0) || 1)) * 100);
            return (
              <div key={type} className="flex items-center gap-2">
                <span className="w-8 text-xs font-mono font-bold" style={{ color: info?.color }}>{type}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: info?.color }} />
                </div>
                <span className="w-8 text-right text-xs font-mono text-muted-foreground">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TherbligPanel;
