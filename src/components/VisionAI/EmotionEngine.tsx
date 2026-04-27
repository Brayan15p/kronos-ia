import React from 'react';
import { EmotionState, EmotionLevel } from './types';
import { EMOTION_INFO } from './utils';
import { Heart, Activity } from 'lucide-react';

interface Props {
  current: EmotionState | null;
  history: EmotionState[];
}

const LEVELS: EmotionLevel[] = ['fatigued', 'stressed', 'neutral', 'focused', 'motivated'];

const EmotionEngine: React.FC<Props> = ({ current, history }) => {
  const avgScore = history.length > 0
    ? Math.round(history.slice(-60).reduce((s, e) => s + e.score, 0) / Math.min(60, history.length))
    : 0;

  const dominant: EmotionLevel = history.length > 10
    ? (() => {
        const counts: Record<string, number> = {};
        history.slice(-60).forEach(e => { counts[e.level] = (counts[e.level] || 0) + 1; });
        return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as EmotionLevel) || 'neutral';
      })()
    : 'neutral';

  const info = current ? EMOTION_INFO[current.level] : EMOTION_INFO['neutral'];
  const miniHistory = history.slice(-40);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Heart className="w-4 h-4 text-pink-400" />
        <h3 className="font-display font-bold text-sm text-foreground">Estado Emocional</h3>
      </div>

      {/* Main emotion display */}
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 transition-all duration-500"
          style={{ background: info.color + '18', border: `1px solid ${info.color}33`, boxShadow: `0 0 20px -6px ${info.color}55` }}
        >
          {info.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-base text-foreground" style={{ color: info.color }}>
            {info.label}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${current?.score || 0}%`, background: `linear-gradient(90deg, ${info.color}99, ${info.color})` }}
              />
            </div>
            <span className="text-xs font-mono font-bold" style={{ color: info.color }}>{current?.score || 0}%</span>
          </div>
        </div>
      </div>

      {/* Emotion scale */}
      <div className="grid grid-cols-5 gap-1">
        {LEVELS.map(level => {
          const linfo = EMOTION_INFO[level];
          const active = current?.level === level;
          return (
            <div
              key={level}
              className="flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all duration-300"
              style={{
                background: active ? linfo.color + '18' : 'transparent',
                border: `1px solid ${active ? linfo.color + '44' : 'transparent'}`,
              }}
            >
              <span className="text-lg">{linfo.emoji}</span>
              <span className="text-[9px] text-center leading-tight" style={{ color: active ? linfo.color : '#64748b' }}>
                {linfo.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mini sparkline */}
      {miniHistory.length > 3 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Tendencia de bienestar</p>
          </div>
          <div className="flex items-end gap-0.5 h-8">
            {miniHistory.map((e, i) => {
              const einfo = EMOTION_INFO[e.level];
              const h = Math.max(4, (e.score / 100) * 32);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all duration-300"
                  style={{ height: h, background: einfo.color + '88', minWidth: 4 }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Promedio sesión</p>
          <p className="text-lg font-mono font-bold text-foreground">{avgScore}<span className="text-xs text-muted-foreground">%</span></p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Estado dominante</p>
          <p className="text-sm font-bold" style={{ color: EMOTION_INFO[dominant].color }}>
            {EMOTION_INFO[dominant].emoji} {EMOTION_INFO[dominant].label}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmotionEngine;
